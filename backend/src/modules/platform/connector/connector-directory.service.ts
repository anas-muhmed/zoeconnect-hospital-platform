import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ConnectorInstance } from './entities/connector-instance.entity';

/**
 * ConnectorDirectoryService (ZoeConnect Connector, Phase C — 2026-07-21).
 *
 * The tenant -> connectorId lookup `CloudOracleTransport` needs to route a
 * dispatch through `ConnectorGateway`/`ConnectorJobDispatchService`
 * (see ADR_CONNECTOR_PROTOCOL.md §4). Deliberately a separate, tiny
 * service rather than folding this query into `CloudOracleTransport`
 * itself -- keeps that class free of a direct `ConnectorInstance`
 * repository dependency, and gives this lookup its own seam for a future
 * caching layer if per-request DB lookups become a bottleneck (not done
 * here -- premature until there's a real multi-tenant WS pilot to
 * measure).
 *
 * "Most recent non-revoked instance" rather than "exactly one" because
 * `ConnectorGateway`'s own doc comment already notes today's model is
 * "today always <=1 in practice" but the architecture doesn't preclude
 * more than one per tenant later (HA) -- this picks the most-recently-
 * registered one, which is also the one most likely to actually be the
 * live process for a re-registered/replaced connector.
 */
@Injectable()
export class ConnectorDirectoryService {
  constructor(
    @InjectRepository(ConnectorInstance) private readonly instanceRepo: Repository<ConnectorInstance>,
  ) {}

  async findConnectorIdForTenant(tenantId: string): Promise<string | null> {
    const instance = await this.findInstanceForTenant(tenantId);
    return instance?.id ?? null;
  }

  /**
   * D.6 ("Onboarding UX," 2026-07-22) -- the full row, for surfaces (the
   * Vendor Portal Connector page) that need more than just the id
   * (status, hostname, version, lastHeartbeatAt). Same "most recent
   * non-revoked instance" selection as `findConnectorIdForTenant()`
   * (factored to share it, not duplicate the query).
   */
  async findInstanceForTenant(tenantId: string): Promise<ConnectorInstance | null> {
    return this.instanceRepo.findOne({
      where: { tenantId, status: Not('revoked') },
      order: { createdAt: 'DESC' },
    });
  }
}
