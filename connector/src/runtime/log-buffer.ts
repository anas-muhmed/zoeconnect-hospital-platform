/**
 * In-memory rolling log buffer (Task #103, 2026-07-22).
 *
 * The Connector Manager UI's Logs page and the Diagnostics export both
 * need "recent events," and per the task's explicit product goal ("no
 * terminal... required"), a hospital IT admin can't be expected to go
 * find a log FILE on disk and open it in Notepad. This buffer is the
 * source of truth for both: every log line the runtime emits (Oracle
 * connect/reconfigure, WS connect/disconnect, template sync, activation)
 * is captured here AS WELL AS written to the console (unchanged existing
 * behavior -- this is additive, not a replacement for stdout logging that
 * a Windows Service wrapper might redirect to a file).
 *
 * Deliberately in-memory only, capped at `MAX_ENTRIES` -- this is a
 * recent-activity viewer, not a durable audit log (that's what the cloud
 * backend's `AuditService`/`audit_logs` table is for, for the actions that
 * cross the cloud boundary). A process restart clears it; that's an
 * accepted trade-off for v1, consistent with this task's scope (no new
 * persistence layer requested).
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string; // ISO-8601
  level: LogLevel;
  message: string;
}

const MAX_ENTRIES = 500;

export class LogBuffer {
  private entries: LogEntry[] = [];

  push(level: LogLevel, message: string): void {
    this.entries.push({ timestamp: new Date().toISOString(), level, message });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }
  }

  /** Newest first -- matches how the Logs page and every other "recent activity" list in this codebase (e.g. the Vendor Portal Connector activity panel) orders things. */
  list(opts: { level?: LogLevel; limit?: number } = {}): LogEntry[] {
    let result = this.entries;
    if (opts.level) {
      result = result.filter((e) => e.level === opts.level);
    }
    const limited = result.slice(-1 * (opts.limit ?? MAX_ENTRIES));
    return limited.slice().reverse();
  }

  clear(): void {
    this.entries = [];
  }

  /**
   * Wraps a plain `{log,warn,error}` logger (the shape `OracleClient`,
   * `Connector`, and `WebSocketMessageTransport` all already accept) so
   * every message they log also lands in this buffer -- one call site,
   * every subsystem's log output captured, no changes needed to any of
   * those classes themselves.
   */
  asLogger(): { log: (m: string) => void; warn: (m: string) => void; error: (m: string) => void } {
    return {
      log: (m: string) => { console.log(m); this.push('info', m); },
      warn: (m: string) => { console.warn(m); this.push('warn', m); },
      error: (m: string) => { console.error(m); this.push('error', m); },
    };
  }
}
