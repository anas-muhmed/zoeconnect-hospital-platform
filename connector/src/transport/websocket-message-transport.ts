import type { Socket } from 'socket.io-client';
import type {
  IMessageTransport,
  MessageTransportRequest,
  MessageTransportResponse,
} from '../protocol/message-transport.interface';
import type { SyncedTemplateDefinition } from '../protocol/sync-templates.interface';

export interface WebSocketTransportOptions {
  cloudUrl: string;
  /** Called once per (re)connect attempt, not cached here -- lets a caller layer in "refresh if near-expiry" logic (token-store.ts) without this class needing to know about refresh tokens at all. */
  getAccessToken: () => string | Promise<string>;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  logger?: { log: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

/**
 * WebSocketMessageTransport (HDSP Connector, Phase B — 2026-07-21).
 *
 * The connector-side counterpart to `ConnectorGateway`
 * (`backend/src/modules/platform/connector/connector.gateway.ts`). Speaks
 * the exact same `MessageTransportRequest`/`Response` protocol
 * `RedisMessageTransport` already does — this is a second transport for
 * the same contract, not a new one (see `IMessageTransport`'s own doc
 * comment, which predicted exactly this addition).
 *
 * Deliberately asymmetric with `RedisMessageTransport`, and that
 * asymmetry is intentional, not an oversight: Redis pub/sub is
 * naturally bidirectional (the same class can be instantiated on either
 * side, "send" and "receive" are just different channel roles), but a
 * WebSocket connection has a real client and a real server -- the
 * Connector always DIALS OUT (this class, a `socket.io-client` wrapper)
 * and the cloud backend always ACCEPTS (`ConnectorGateway`, a NestJS
 * Gateway, structurally different because it needs `Server`/room access
 * that a plain `IMessageTransport` implementation has no way to express).
 * This class therefore only implements the RECEIVER half of the
 * interface for real (`onRequest`/`start`/`stop`); `send()` exists to
 * satisfy the interface but throws if actually called, since nothing on
 * the connector side ever originates a request over this transport.
 *
 * Uses `transports: ['websocket']` (not socket.io's default of falling
 * back to HTTP long-polling) -- a genuine persistent outbound WebSocket
 * connection is exactly what a hospital firewall should see as ordinary
 * HTTPS traffic on one connection; falling back to repeated polling
 * requests would both look different to network monitoring and defeat
 * the "one outbound connection, no polling" design goal from
 * `HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md` §5.
 */
export class WebSocketMessageTransport implements IMessageTransport {
  private socket: Socket | null = null;
  private handler: ((req: MessageTransportRequest) => Promise<MessageTransportResponse>) | null = null;
  private syncHandler: ((definitions: SyncedTemplateDefinition[]) => void) | null = null;
  private readonly logger: NonNullable<WebSocketTransportOptions['logger']>;

  constructor(private readonly options: WebSocketTransportOptions) {
    this.logger = options.logger ?? { log: console.log, warn: console.warn, error: console.error };
  }

  onRequest(handler: (req: MessageTransportRequest) => Promise<MessageTransportResponse>): void {
    this.handler = handler;
  }

  /**
   * Task #103 ("HDSP Connector Manager," 2026-07-22) -- the Dashboard
   * page's "Cloud: Connected/Disconnected" indicator and the local REST
   * API's `/api/status` both need to read this synchronously; previously
   * nothing outside this class could observe connection state at all
   * except by listening to its internal logger output.
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Task #103 -- backs the Dashboard's "Reconnect" button and the tray
   * menu's "Reconnect" item. socket.io already auto-reconnects on
   * transient drops (see `start()`'s `reconnection: true`), so this exists
   * for the explicit "something looks stuck, force it" case a human
   * decides to invoke, not for the normal reconnect path. A disconnect
   * immediately followed by connect is safe to call even when already
   * connected (socket.io no-ops a connect() call on an already-connecting
   * or already-connected socket).
   */
  forceReconnect(): void {
    if (!this.socket) return;
    this.socket.disconnect();
    this.socket.connect();
  }

  /**
   * Registers a handler for `connector:sync-templates` pushes (D.3,
   * DYNAMIC_HIS_QUERY_ARCHITECTURE.md §5) -- delivered over this SAME
   * authenticated socket, not a second connection. One-way (cloud ->
   * connector only); there is no response to correlate, unlike
   * `onRequest()`'s request/response pairing.
   */
  onTemplateSync(handler: (definitions: SyncedTemplateDefinition[]) => void): void {
    this.syncHandler = handler;
  }

  async start(): Promise<void> {
    const token = await this.options.getAccessToken();
    const url = `${this.options.cloudUrl.replace(/\/+$/, '')}/connector`;

    const { io } = await import('socket.io-client');
    this.socket = io(url, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: this.options.reconnectionDelay ?? 1000,
      reconnectionDelayMax: this.options.reconnectionDelayMax ?? 30000,
      transports: ['websocket'],
    });

    this.socket.on('connect', () => this.logger.log(`[WS-TRANSPORT] Connected to ${url}`));
    this.socket.on('disconnect', (reason) => this.logger.warn(`[WS-TRANSPORT] Disconnected: ${reason} — socket.io will auto-reconnect`));
    this.socket.on('connect_error', (err) => this.logger.warn(`[WS-TRANSPORT] Connection error: ${err.message}`));
    this.socket.on('connector:error', (payload: { message: string }) =>
      this.logger.error(`[WS-TRANSPORT] Server rejected connection: ${payload.message}`),
    );

    this.socket.on('connector:sync-templates', (payload: { definitions: SyncedTemplateDefinition[] }) => {
      if (!this.syncHandler) {
        this.logger.warn('[WS-TRANSPORT] Received template sync before a handler was registered — dropping');
        return;
      }
      this.syncHandler(payload.definitions ?? []);
    });

    this.socket.on('connector:request', async (req: MessageTransportRequest) => {
      if (!this.handler) {
        this.logger.warn(`[WS-TRANSPORT] Received request ${req.correlationId} before a handler was registered — dropping`);
        return;
      }
      try {
        const res = await this.handler(req);
        this.socket?.emit('connector:response', res);
      } catch (err) {
        // handler should already catch and return a structured error
        // response (see Connector.handleRequest()) -- this is a last-resort
        // guard against a handler that itself throws.
        this.socket?.emit('connector:response', {
          correlationId: req.correlationId,
          ok: false,
          error: { message: (err as Error).message, retryable: true },
        } satisfies MessageTransportResponse);
      }
    });

    // Only the FIRST connection attempt is awaited here -- subsequent
    // reconnects are entirely socket.io's own reconnection loop's
    // responsibility, not something callers of start() should block on.
    await new Promise<void>((resolve, reject) => {
      this.socket!.once('connect', () => resolve());
      this.socket!.once('connect_error', (err) => reject(err));
    });
  }

  async stop(): Promise<void> {
    this.socket?.disconnect();
    this.socket = null;
  }

  send(): Promise<MessageTransportResponse> {
    return Promise.reject(new Error(
      'WebSocketMessageTransport.send() is not applicable on the connector side -- ' +
      'this transport only ever RECEIVES requests (see this class\'s doc comment). ' +
      'The cloud/caller side of a job dispatch is ConnectorGateway.dispatchToConnector(), ' +
      'not an IMessageTransport implementation.',
    ));
  }
}
