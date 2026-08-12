import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../../config/redis.config';
import { ConnectorGateway } from './connector.gateway';
import type { ConnectorJobData } from './connector-job-dispatch.service';
import type { MessageTransportResponse } from '@hdsp/connector';

/**
 * ConnectorJobDispatchProcessor (ZoeConnect Connector, Phase B — 2026-07-21).
 *
 * The Bull worker side of `ConnectorJobDispatchService`. Deliberately thin
 * -- it does exactly one thing, call `ConnectorGateway.dispatchToConnector()`
 * and return its result (or throw, letting Bull's own retry/backoff handle
 * "connector was briefly offline" per the gateway's own doc comment on
 * `dispatchToConnector()`). No tenant/business logic lives here; this is
 * purely the durability layer over the gateway's in-memory dispatch.
 */
@Processor(QUEUE_NAMES.CONNECTOR_JOBS)
export class ConnectorJobDispatchProcessor {
  private readonly logger = new Logger(ConnectorJobDispatchProcessor.name);

  constructor(private readonly gateway: ConnectorGateway) {}

  @Process('dispatch')
  async handleDispatch(job: Job<ConnectorJobData>): Promise<MessageTransportResponse> {
    const { connectorId, request, timeoutMs } = job.data;
    return this.gateway.dispatchToConnector(connectorId, request, timeoutMs);
  }

  @OnQueueFailed()
  onFailed(job: Job<ConnectorJobData>, err: Error): void {
    this.logger.error(
      `Connector job failed: correlationId=${job.data.request.correlationId} ` +
      `connector=${job.data.connectorId} attempt=${job.attemptsMade} error=${err.message}`,
    );
  }
}
