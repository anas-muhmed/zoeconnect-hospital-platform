import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

/**
 * Oracle health indicator — non-critical component.
 * If Oracle HIS is unreachable, platform degrades gracefully
 * (HIS-dependent features return 503; core platform still operates).
 */
@Injectable()
export class OracleHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    // Oracle pool is managed by OraclePoolService (Phase 3)
    // During Phase 0 we check the config is present and reachable via TCP
    try {
      const net = await import('net');
      const host = this.config.get<string>('oracle.host') ?? 'localhost';
      const port = this.config.get<number>('oracle.port') ?? 1521;

      const isReachable = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host, port, timeout: 3000 });
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
      });

      const result = this.getStatus(key, isReachable, {
        host,
        port,
        service: this.config.get<string>('oracle.service'),
        mode: isReachable ? 'reachable' : 'unreachable',
        critical: false, // Oracle failure does not fail overall health check
      });

      // Oracle down = warn but not throw (non-critical for platform health)
      return result;
    } catch (error) {
      return this.getStatus(key, false, {
        error: error instanceof Error ? error.message : 'Unknown error',
        critical: false,      });
    }
  }
}

