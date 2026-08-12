import { OracleClient, HisUnavailableError, OracleClientLogger } from '@hdsp/oracle-client';
import { SqlTemplateRegistry } from './protocol/sql-template-registry';
import type {
  IMessageTransport,
  MessageTransportRequest,
  MessageTransportResponse,
} from './protocol/message-transport.interface';

/**
 * Connector (Phase 6 "Connector", Tasks 6.2-6.4).
 *
 * The standalone component itself: wires `OracleClient` (Task 6.1's shared
 * package) to an `IMessageTransport` (Task 6.2), resolving every incoming
 * request's `sqlTemplateId` against a `SqlTemplateRegistry` before ever
 * touching Oracle. Runs entirely independently of the main HDSP backend --
 * nothing in `backend/` imports or depends on this class in Phase 6;
 * `DirectOracleTransport` remains the backend's exclusive Oracle path
 * until Phase 7 wires `CloudOracleTransport` to talk to a real, deployed
 * instance of this class over a real transport.
 */
export class Connector {
  private readonly logger: OracleClientLogger;

  constructor(
    private readonly oracleClient: OracleClient,
    private readonly transport: IMessageTransport,
    private readonly templates: SqlTemplateRegistry,
    logger?: OracleClientLogger,
  ) {
    this.logger = logger ?? { log: console.log, warn: console.warn, error: console.error };
  }

  async start(): Promise<void> {
    await this.oracleClient.connect();
    this.transport.onRequest((req) => this.handleRequest(req));
    await this.transport.start();
    this.logger.log(`[CONNECTOR] Started — Oracle available=${this.oracleClient.isAvailable}, ${this.templates.list().length} SQL template(s) registered`);
  }

  async stop(): Promise<void> {
    await this.transport.stop();
    await this.oracleClient.close();
  }

  /** Reports connectivity for both legs the Connector depends on -- see Task 6.4. */
  isHealthy(): { oracle: boolean; connector: boolean } {
    return {
      oracle: this.oracleClient.isAvailable,
      connector: true, // if this method is reachable, the process itself is up
    };
  }

  async handleRequest(req: MessageTransportRequest): Promise<MessageTransportResponse> {
    try {
      const template = this.templates.resolve(req.sqlTemplateId);

      if (template.kind === 'query') {
        const rows = await this.oracleClient.query(template.sql, req.binds);
        return { correlationId: req.correlationId, ok: true, rows };
      }

      const rowsAffected = await this.oracleClient.execute(template.sql, req.binds);
      return { correlationId: req.correlationId, ok: true, rowsAffected };
    } catch (err) {
      const error = err as Error;
      const retryable = error instanceof HisUnavailableError;
      this.logger.warn(`[CONNECTOR] Request ${req.correlationId} (template=${req.sqlTemplateId}) failed: ${error.message}`);
      return {
        correlationId: req.correlationId,
        ok: false,
        error: { message: error.message, retryable },
      };
    }
  }
}
