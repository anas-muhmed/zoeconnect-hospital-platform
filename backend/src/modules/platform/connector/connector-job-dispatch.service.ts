import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '../../../config/redis.config';
import type { MessageTransportRequest, MessageTransportResponse } from '@hdsp/connector';

export interface ConnectorJobData {
  tenantId: string;
  connectorId: string;
  request: MessageTransportRequest;
  timeoutMs: number;
}

/**
 * ConnectorJobDispatchService (ZoeConnect Connector, Phase B — 2026-07-21).
 *
 * The durable front door in front of `ConnectorGateway.dispatchToConnector()`.
 * The gateway's dispatch is entirely in-memory (a `Map` of pending
 * correlationIds tied to one live socket) -- if the backend process
 * restarts mid-dispatch, or a connector is briefly offline when the
 * request is made, that in-memory state is gone. Bull gives this a
 * durable queue with the retry/backoff policy already centralized in
 * `bullAsyncOptions` (`redis.config.ts`: 3 attempts, exponential backoff)
 * so a `ConnectorOfflineError`/timeout thrown by the gateway is retried
 * automatically instead of the caller having to hand-roll retry logic.
 *
 * `dispatch()` is the caller-facing entrypoint: it enqueues a Bull job
 * and awaits `Job.finished()` so the caller gets a real
 * `MessageTransportResponse` back, same as if it had called the gateway
 * directly -- Bull is purely an implementation detail of durability here,
 * not something callers need to know about.
 *
 * NOT wired into `ORACLE_TRANSPORT`/`CloudOracleTransport`'s selection in
 * this pass (matches `ConnectorGateway`'s own scope note) -- this class
 * exists and is fully testable in isolation (Task 60's end-to-end test)
 * but nothing in the HIS business services calls it yet.
 */
@Injectable()
export class ConnectorJobDispatchService {
  private readonly logger = new Logger(ConnectorJobDispatchService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.CONNECTOR_JOBS) private readonly queue: Queue<ConnectorJobData>,
  ) {}

  /**
   * Enqueues a job for a specific tenant's connector and resolves with its
   * response once the processor's `dispatchToConnector()` call succeeds,
   * or rejects once Bull exhausts its configured retry attempts (see
   * `bullAsyncOptions.defaultJobOptions` -- 3 attempts, exponential
   * backoff starting at 1s). `timeoutMs` bounds each individual dispatch
   * attempt inside the gateway, not the overall retry budget.
   */
  async dispatch(
    tenantId: string,
    connectorId: string,
    request: MessageTransportRequest,
    timeoutMs = 15_000,
  ): Promise<MessageTransportResponse> {
    const job = await this.queue.add(
      'dispatch',
      { tenantId, connectorId, request, timeoutMs },
      { jobId: request.correlationId },
    );

    this.logger.debug(
      `Enqueued connector job: correlationId=${request.correlationId} tenant=${tenantId} connector=${connectorId}`,
    );

    return job.finished() as Promise<MessageTransportResponse>;
  }
}
