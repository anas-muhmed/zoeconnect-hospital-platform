import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface DockerDetectionResult {
  containerName: string | null;
  source: 'compose-file' | 'running-container' | null;
}

/**
 * PgDockerDetectionService — best-effort discovery of a running Postgres
 * Docker container, used by PgEngineService's 'auto' resolution when local
 * pg_dump/pg_restore aren't found on the host. Never throws; every public
 * method degrades to `{ containerName: null, source: null }` on any
 * failure (missing docker-compose file, `docker` CLI not installed, `docker
 * ps` failing/timing out, anything).
 *
 * Two detection strategies, tried in order:
 *
 *   (a) docker-compose.yml/.yaml in the app's working directory or one
 *       level up (`process.cwd()` and its parent) — light manual
 *       line-based scan (no `js-yaml`/YAML-parser dependency in this
 *       codebase to reuse, and adding one just for this would be overkill)
 *       for a service block whose `image:` starts with `postgres` and
 *       whose port mapping includes `database.port`. This is a heuristic,
 *       NOT a real YAML parser -- it does not handle anchors, multi-
 *       document files, or arbitrarily-nested indentation robustly. It's
 *       good enough for the standard/common docker-compose shape
 *       (top-level `services:` block, 2-space-indented service names, each
 *       with `image:`/`ports:` keys a couple of levels deeper) that the
 *       vast majority of real compose files use.
 *
 *   (b) `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'` — look
 *       for a running container whose image contains "postgres" and whose
 *       port mapping includes `database.port`.
 */
@Injectable()
export class PgDockerDetectionService {
  private readonly logger = new Logger(PgDockerDetectionService.name);

  constructor(private readonly configService: ConfigService) {}

  async detect(): Promise<DockerDetectionResult> {
    const port = this.configService.get<number>('database.port') || 5432;

    const fromCompose = this.detectFromComposeFiles(port);
    if (fromCompose) {
      return { containerName: fromCompose, source: 'compose-file' };
    }

    const fromRunning = await this.detectFromRunningContainers(port);
    if (fromRunning) {
      return { containerName: fromRunning, source: 'running-container' };
    }

    return { containerName: null, source: null };
  }

  // ── (a) docker-compose.yml scan ──────────────────────────────────────────

  private detectFromComposeFiles(port: number): string | null {
    const candidateDirs = [process.cwd(), path.join(process.cwd(), '..')];
    const fileNames = ['docker-compose.yml', 'docker-compose.yaml'];

    for (const dir of candidateDirs) {
      for (const fileName of fileNames) {
        try {
          const filePath = path.join(dir, fileName);
          if (!fs.existsSync(filePath)) continue;
          const content = fs.readFileSync(filePath, 'utf-8');
          const found = this.parseComposeForPostgresService(content, port);
          if (found) return found;
        } catch (err) {
          this.logger.warn(`Docker detection: error reading ${fileName} in ${dir}: ${(err as Error).message}`);
        }
      }
    }
    return null;
  }

  /**
   * Line-based heuristic scan of docker-compose YAML for a service whose
   * `image:` starts with "postgres" and whose `ports:` list includes the
   * target port (either side of a "host:container" mapping, or a bare
   * port). Returns the service name (docker-compose's container name
   * defaults to `<project>_<service>_1` or `<project>-<service>-1`
   * depending on compose version, but the bare service name is also a
   * valid `docker exec`/`docker-compose exec` target and is what we
   * surface -- callers running plain `docker exec <name> ...` should note
   * this is the compose SERVICE name, not necessarily the literal
   * container name; PgEngineService treats this as a best-effort hint the
   * admin can override under Advanced if it doesn't match).
   */
  parseComposeForPostgresService(content: string, port: number): string | null {
    const lines = content.split(/\r?\n/);
    let inServices = false;
    let servicesIndent = -1;
    let currentService: string | null = null;
    let currentServiceIndent = -1;
    let currentIsPostgres = false;
    let currentPortMatch = false;
    let inPortsBlock = false;

    const indentOf = (line: string) => line.length - line.replace(/^\s+/, '').length;

    const commitService = () => {
      if (currentService && currentIsPostgres && currentPortMatch) {
        return currentService;
      }
      return null;
    };

    for (const rawLine of lines) {
      if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
      const indent = indentOf(rawLine);
      const trimmed = rawLine.trim();

      if (/^services:\s*$/.test(trimmed)) {
        inServices = true;
        servicesIndent = indent;
        continue;
      }
      if (!inServices) continue;

      // Top-level key other than "services" ends the services block.
      if (indent <= servicesIndent && /^[A-Za-z0-9_-]+:\s*$/.test(trimmed) && !/^services:\s*$/.test(trimmed)) {
        inServices = false;
        continue;
      }

      // A new service name is a key one indent level deeper than "services:".
      const serviceMatch = trimmed.match(/^([A-Za-z0-9_.-]+):\s*$/);
      if (serviceMatch && indent > servicesIndent && (currentServiceIndent === -1 || indent <= currentServiceIndent)) {
        const found = commitService();
        if (found) return found;
        currentService = serviceMatch[1];
        currentServiceIndent = indent;
        currentIsPostgres = false;
        currentPortMatch = false;
        inPortsBlock = false;
        continue;
      }

      if (!currentService) continue;

      const imageMatch = trimmed.match(/^image:\s*["']?([^"'\s]+)["']?/);
      if (imageMatch) {
        const image = imageMatch[1];
        const imageName = image.split('/').pop() || image;
        if (/^postgres/i.test(imageName)) currentIsPostgres = true;
        inPortsBlock = false;
        continue;
      }

      if (/^ports:\s*$/.test(trimmed)) {
        inPortsBlock = true;
        continue;
      }
      if (inPortsBlock) {
        // "- 5432:5432" / "- '5432:5432'" / '- "5433:5432"' / "- 5432"
        const portLine = trimmed.match(/^-\s*["']?(\d+)(?::(\d+))?["']?/);
        if (portLine) {
          const hostPort = parseInt(portLine[1], 10);
          const containerPort = portLine[2] ? parseInt(portLine[2], 10) : hostPort;
          if (hostPort === port || containerPort === port) currentPortMatch = true;
          continue;
        }
        // Non-list-item line at this indent ends the ports block.
        if (!trimmed.startsWith('-')) inPortsBlock = false;
      }
    }

    return commitService();
  }

  // ── (b) `docker ps` scan ─────────────────────────────────────────────────

  private detectFromRunningContainers(port: number): Promise<string | null> {
    return new Promise((resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn('docker', ['ps', '--format', '{{.Names}}\t{{.Image}}\t{{.Ports}}']);
      } catch {
        resolve(null);
        return;
      }

      let out = '';
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const timeout = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        finish(null);
      }, 5000);

      child.stdout?.on('data', (d: Buffer) => { out += d.toString('utf-8'); });
      child.on('error', () => { clearTimeout(timeout); finish(null); });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) { finish(null); return; }
        finish(this.parseDockerPsOutput(out, port));
      });
    });
  }

  parseDockerPsOutput(out: string, port: number): string | null {
    const lines = out.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines) {
      const [name, image, ports] = line.split('\t');
      if (!name || !image) continue;
      if (!/postgres/i.test(image)) continue;
      if (ports && this.portsStringMatches(ports, port)) return name.trim();
      if (!ports) continue;
    }
    return null;
  }

  /** Matches Docker's "0.0.0.0:5432->5432/tcp, :::5432->5432/tcp" port-mapping format against a target port on either side. */
  private portsStringMatches(portsStr: string, port: number): boolean {
    const matches = portsStr.matchAll(/(?:[\d.:a-fA-F]*:)?(\d+)->(\d+)\/\w+/g);
    for (const m of matches) {
      if (parseInt(m[1], 10) === port || parseInt(m[2], 10) === port) return true;
    }
    return portsStr.includes(String(port));
  }
}
