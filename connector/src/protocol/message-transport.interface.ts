/**
 * Message Transport protocol (Phase 6 "Connector", Task 6.2).
 *
 * Spec Section 7.2's request/response shape: a request identifies a
 * pre-registered, allow-listed SQL template by ID (never a raw SQL string
 * over the wire -- see `SqlTemplateRegistry`) plus bind parameters; the
 * response correlates back to the request and carries either rows (for a
 * SELECT-shaped template), rowsAffected (for a DML-shaped template), or an
 * error.
 *
 * Deliberately transport-technology-agnostic: `IMessageTransport` is the
 * seam a concrete transport (Redis pub-sub today, WebSocket/queue later)
 * implements. Per the roadmap's own recommendation (a message queue for
 * async sync traffic + WebSocket/short-poll for interactive lookups), this
 * phase implements ONE concrete transport (`RedisMessageTransport`) since
 * Redis/BullMQ are already established infrastructure in this monorepo
 * (`backend`'s `ioredis`/`@nestjs/bull` dependencies) -- reusing existing
 * infra rather than introducing a new one, consistent with Phase 5's
 * reuse of the AWS SDK already introduced in Phase 3. A WebSocket
 * transport for the interactive-lookup case is left as a documented,
 * not-yet-implemented follow-up (see PHASE_6_IMPLEMENTATION_PLAN.md).
 */

export interface MessageTransportRequest {
  correlationId: string;
  sqlTemplateId: string;
  binds: Record<string, unknown>;
}

export interface MessageTransportSuccessResponse {
  correlationId: string;
  ok: true;
  rows?: Record<string, unknown>[];
  rowsAffected?: number;
}

export interface MessageTransportErrorResponse {
  correlationId: string;
  ok: false;
  error: {
    message: string;
    /** Mirrors NotificationResult's retryable field (Phase 5) -- lets a
     * caller distinguish "Oracle rejected this query" (don't retry) from
     * "connector/Oracle temporarily unreachable" (safe to retry). */
    retryable: boolean;
  };
}

export type MessageTransportResponse = MessageTransportSuccessResponse | MessageTransportErrorResponse;

/**
 * A transport implementation delivers requests to the Connector and
 * carries responses back to the caller. The Connector itself (see
 * `connector.ts`) is transport-agnostic -- it only knows how to handle a
 * `MessageTransportRequest` and produce a `MessageTransportResponse`; how
 * that pair of messages physically travels is entirely this interface's
 * concern.
 */
export interface IMessageTransport {
  /** Registers the Connector-side handler that processes incoming requests. */
  onRequest(handler: (req: MessageTransportRequest) => Promise<MessageTransportResponse>): void;

  /** Caller-side: send a request and await its correlated response. */
  send(req: MessageTransportRequest, timeoutMs?: number): Promise<MessageTransportResponse>;

  start(): Promise<void>;
  stop(): Promise<void>;
}
