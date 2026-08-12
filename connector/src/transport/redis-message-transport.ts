import Redis from 'ioredis';
import type {
  IMessageTransport,
  MessageTransportRequest,
  MessageTransportResponse,
} from '../protocol/message-transport.interface';

const REQUEST_CHANNEL = 'hdsp:connector:requests';
const responseChannel = (correlationId: string) => `hdsp:connector:responses:${correlationId}`;

/**
 * RedisMessageTransport (Phase 6 "Connector", Task 6.2) — concrete
 * `IMessageTransport` implementation using Redis pub/sub, chosen because
 * Redis is already established infrastructure in this monorepo (backend's
 * `ioredis`/`@nestjs/bull` dependencies), matching Phase 5's pattern of
 * reusing an already-adopted vendor stack (AWS SDK) rather than
 * introducing a new one for a phase whose primary goal is proving a
 * protocol contract, not picking the "best" message broker.
 *
 * Scheme: requests are published on one shared channel
 * (`hdsp:connector:requests`); the Connector-side subscriber handles them
 * and publishes the correlated response on a per-request channel
 * (`hdsp:connector:responses:<correlationId>`) that the caller
 * subscribes to transiently, for exactly one message, then unsubscribes.
 * This keeps the shared request channel from also needing to filter out
 * responses meant for other in-flight callers.
 *
 * Per the roadmap's own note ("message queue for async sync traffic +
 * WebSocket or short-poll for interactive lookups"), this pub/sub
 * transport is best suited to the async/batch-sync case; a WebSocket
 * transport for low-latency interactive lookups is a documented,
 * not-yet-implemented follow-up (see PHASE_6_IMPLEMENTATION_PLAN.md) —
 * `IMessageTransport` is deliberately shaped so adding one later doesn't
 * require touching `Connector` at all.
 */
export class RedisMessageTransport implements IMessageTransport {
  private readonly pub: Redis;
  private readonly sub: Redis;
  private handler: ((req: MessageTransportRequest) => Promise<MessageTransportResponse>) | null = null;

  constructor(redisUrl: string) {
    // `lazyConnect: true` -- ioredis connects eagerly (at construction time)
    // by default, unlike e.g. the AWS SDK clients which merely validate
    // config synchronously. That matters here because the backend's
    // `CloudOracleTransport` (see cloud-oracle.transport.ts) always builds
    // one of these regardless of ORACLE_TRANSPORT mode, on the documented
    // assumption that construction is "cheap -- no eager network calls".
    // Without lazyConnect that assumption was false: every backend boot
    // opened two real Redis connections and kept them retrying forever,
    // even when ORACLE_TRANSPORT=direct (default) never sends a single
    // message over them. With lazyConnect, both clients stay fully idle
    // until the first actual command (`.subscribe()`/`.publish()`, called
    // from `start()`/`send()`), which only happens when this transport is
    // genuinely in use -- by the standalone connector process (which calls
    // `start()` immediately) or by a backend actually running in
    // cloud_relay mode.
    this.pub = new Redis(redisUrl, { lazyConnect: true });
    this.sub = new Redis(redisUrl, { lazyConnect: true });

    // Every client this transport owns must have an error listener --
    // ioredis falls back to its own unlabeled `[ioredis] Unhandled error
    // event: ...` console logging otherwise, which is how the missing
    // password below surfaced as a confusing, unattributed boot-time error.
    this.pub.on('error', (err) => console.error('[RedisMessageTransport:pub] Error:', err.message));
    this.sub.on('error', (err) => console.error('[RedisMessageTransport:sub] Error:', err.message));
  }

  onRequest(handler: (req: MessageTransportRequest) => Promise<MessageTransportResponse>): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    await this.sub.subscribe(REQUEST_CHANNEL);
    this.sub.on('message', (channel, message) => {
      if (channel !== REQUEST_CHANNEL || !this.handler) return;
      void this.handleIncoming(message);
    });
  }

  private async handleIncoming(message: string): Promise<void> {
    let req: MessageTransportRequest;
    try {
      req = JSON.parse(message) as MessageTransportRequest;
    } catch {
      return; // malformed message on the shared channel -- nothing to correlate a response to
    }
    const response = await this.handler!(req);
    await this.pub.publish(responseChannel(req.correlationId), JSON.stringify(response));
  }

  /** Caller-side: publish a request, await the correlated response on its dedicated channel. */
  async send(req: MessageTransportRequest, timeoutMs = 30_000): Promise<MessageTransportResponse> {
    const channel = responseChannel(req.correlationId);
    const subscriber = this.pub.duplicate();
    subscriber.on('error', (err) => console.error('[RedisMessageTransport:send-subscriber] Error:', err.message));

    try {
      await subscriber.subscribe(channel);

      const responsePromise = new Promise<MessageTransportResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Message Transport request ${req.correlationId} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        subscriber.on('message', (ch, message) => {
          if (ch !== channel) return;
          clearTimeout(timer);
          resolve(JSON.parse(message) as MessageTransportResponse);
        });
      });

      await this.pub.publish(REQUEST_CHANNEL, JSON.stringify(req));
      return await responsePromise;
    } finally {
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
    }
  }

  async stop(): Promise<void> {
    await this.sub.unsubscribe(REQUEST_CHANNEL);
    this.sub.disconnect();
    this.pub.disconnect();
  }
}
