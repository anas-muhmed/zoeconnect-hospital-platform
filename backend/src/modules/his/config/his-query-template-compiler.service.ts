import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { HisConfigService } from './his-config.service';
import { buildPatientSelect, buildPatientSearchSql } from './query-templates/patient.templates';
import { buildBillSelect, buildBillByIdSql, buildBillItemsSql } from './query-templates/billing.templates';
import { buildVisitsByMrnSql } from './query-templates/visit.templates';
import { buildDepartmentsSql, buildDoctorsSql } from './query-templates/reference.templates';

export type CompiledQueryKind = 'query' | 'execute';

/**
 * The output of `HisQueryTemplateCompiler.compile()` -- everything a
 * future Publisher (D.3, not built yet) needs to hand to a Connector's
 * `SqlTemplateRegistry`, and everything `CloudOracleTransport` (Phase C)
 * needs to know once it starts resolving `queryId`s instead of raw SQL
 * text (D.4, not built yet).
 *
 * `checksum`/`compiledAt` are populated here; `definitionVersion` is
 * deliberately NOT part of this type. Per
 * `DYNAMIC_HIS_QUERY_ARCHITECTURE.md` §6, `definitionVersion` is a
 * monotonically-increasing counter that only makes sense against
 * PERSISTED prior state ("did the checksum change since last time") --
 * that's the Publisher's job (D.3), which has somewhere to persist
 * "last known checksum per tenant+queryId." This compiler is a pure
 * function of `(tenantId, queryId, parameters)` -> a definition; it holds
 * no state between calls and has nothing to compare against.
 */
export interface CompiledQueryDefinition {
  queryId: string;
  kind: CompiledQueryKind;
  sql: string;
  expectedBinds: string[];
  checksum: string;
  compiledAt: string;
}

export class UnknownQueryIdError extends Error {
  constructor(queryId: string) {
    super(`No compiled-query builder registered for queryId "${queryId}"`);
    this.name = 'UnknownQueryIdError';
  }
}

/**
 * Thrown when a tenant's `HisSchemaConfig` is missing a key a builder
 * needed to interpolate -- surfaces as a clear compile-time error instead
 * of silently producing SQL containing the literal string "undefined"
 * (which would otherwise surface later as a confusing ORA-00904 from
 * Oracle itself, with no indication of which config key was the cause).
 * NOT a substitute for full identifier-format validation at
 * `HisConfigService` write-time (still a separate, not-yet-built defense
 * per `DYNAMIC_HIS_QUERY_ARCHITECTURE.md` §6) -- this is a narrow,
 * compile-time safety net specific to "was the value even present."
 */
export class IncompleteSchemaConfigError extends Error {
  constructor(queryId: string, tenantId: string) {
    super(
      `Cannot compile queryId "${queryId}" for tenant "${tenantId}": the resulting SQL references an ` +
      `unset HisSchemaConfig key (produced the literal text "undefined"). Check that tenant's HIS Config ` +
      `has every required table/column key set for this query.`,
    );
    this.name = 'IncompleteSchemaConfigError';
  }
}

interface QueryIdBuilder {
  kind: CompiledQueryKind;
  expectedBinds: string[];
  /**
   * Builds the SQL for this queryId given a tenant's resolved config map
   * and (rarely) shape-affecting parameters -- e.g. whether an optional
   * filter clause should be present at all. `parameters` here NEVER
   * becomes literal SQL text itself (that would reintroduce exactly the
   * raw-SQL-over-the-wire risk this whole design avoids) -- it only ever
   * drives which branch of an already-reviewed template is selected.
   */
  build: (cfg: Record<string, string>, parameters: Record<string, unknown>) => string;
}

/**
 * HisQueryTemplateCompiler (D.2, DYNAMIC_HIS_QUERY_ARCHITECTURE.md §4/§9).
 *
 * The single entry point: `compile(tenantId, queryId, parameters)`.
 * Callers -- eventually a Publisher (D.3) and `CloudOracleTransport` (D.4)
 * -- never need to know that `patient.templates.ts`/`billing.templates.ts`/
 * `visit.templates.ts`/`reference.templates.ts` exist; those are wired
 * into a private registry inside this class and are its own implementation
 * detail, not part of its public surface. This was an explicit design
 * requirement (avoid the compiler becoming a service locator callers have
 * to reach past) -- there is exactly one public method.
 *
 * Internally, this reads `HisConfigService.getConfig(tenantId)` -- the
 * SAME tenant-scoped config every business service already reads at
 * request time (Phase 3, tonight's tenant-scoped `his_schema_config`
 * work) -- and calls the SAME D.1-extracted builder function that
 * service's own request path calls. There is one source of truth for
 * "what SQL does this operation compile to," shared by direct execution
 * and this compiler; see `patient.templates.ts`'s doc comment for why
 * that matters.
 *
 * ── Known, disclosed limitation: raw admin SQL overrides ──
 *
 * Every registered queryId below first checks for a tenant's raw SQL
 * override (`cfg['sql.<domain>.<operation>']`, exactly the same key each
 * business service itself checks) and compiles that verbatim if present --
 * matching direct-mode's own priority order exactly. For most queryIds
 * this is safe and complete: the raw override is static, tenant-authored
 * SQL, no different in trust level than what direct mode already executes
 * (see `DYNAMIC_HIS_QUERY_ARCHITECTURE.md` §8's provenance/isolation
 * argument).
 *
 * `patient.search` is the one documented exception: `PatientService.search()`
 * additionally rewrites its raw override at REQUEST time --
 * `.replace(/:lim\b/gi, String(safeLim))` -- because Oracle rejects a bind
 * variable in `FETCH FIRST :lim ROWS ONLY` position (a node-oracledb/Oracle
 * parsing restriction, not something this design introduces or could fix by
 * being cleverer). That substitution embeds the per-request row limit as a
 * literal integer, which cannot be reduced to a single static per-tenant
 * compiled SQL string -- it is genuinely per-request-variant. This
 * compiler therefore compiles a tenant's raw `sql.patient.search` override
 * AS-IS (unmodified), which will fail with ORA-01745 if that tenant's
 * override happens to use `:lim` inside a `FETCH FIRST` clause. This is a
 * real, open gap for that specific combination (raw override + `:lim` in
 * that specific clause position), left disclosed rather than silently
 * worked around -- resolving it is future work (either require such
 * overrides to avoid that clause shape, or extend the sync protocol to
 * carry a request-time bind-to-literal rewrite rule), not something D.2
 * should paper over by guessing.
 */
@Injectable()
export class HisQueryTemplateCompiler {
  constructor(private readonly hisConfig: HisConfigService) {}

  private readonly registry: Record<string, QueryIdBuilder> = {
    'patient.getByMrn': {
      kind: 'query',
      expectedBinds: ['mrn'],
      build: (cfg) => {
        const rawSql = cfg['sql.patient.getByMrn']?.trim();
        if (rawSql) return rawSql;
        const { select, joins } = buildPatientSelect(cfg);
        return `${select} WHERE p.${cfg['patient.col.mrn']} = :mrn ${joins}`;
      },
    },
    'patient.search': {
      kind: 'query',
      expectedBinds: ['term', 'nameMatch'],
      build: (cfg) => {
        // See this class's doc comment -- raw override compiled as-is,
        // ":lim"/":like" request-time rewriting is a known, disclosed gap
        // for tenants whose override uses those placeholders.
        const rawSql = cfg['sql.patient.search']?.trim();
        if (rawSql) return rawSql;
        return buildPatientSearchSql(cfg);
      },
    },
    'billing.getBillsByMrn': {
      kind: 'query',
      expectedBinds: ['mrn', 'lim'],
      build: (cfg) => {
        const rawSql = cfg['sql.billing.getBillsByMrn']?.trim();
        if (rawSql) return rawSql;
        const { select, joins } = buildBillSelect(cfg);
        return `
          SELECT * FROM (
            ${select}
            ${joins}
            WHERE b.${cfg['billing.col.mrn']} = :mrn
            ORDER BY b.${cfg['billing.col.billDate']} DESC
          ) WHERE ROWNUM <= :lim
        `;
      },
    },
    // D.5 fix (2026-07-22): visitType/activeOnly/deptCode used to be
    // compile-time parameters that changed these three builders' SQL TEXT
    // (see visit.templates.ts's and reference.templates.ts's own D.5 doc
    // comments for the full incompatibility this caused with "one queryId
    // = one canonical compiled definition"). All three builders are now
    // pure functions of `cfg` alone -- the `parameters` argument below is
    // no longer read for any of them, by design; the corresponding filter
    // is expressed as an always-present bind in the SQL instead.
    'visit.getByMrn': {
      kind: 'query',
      expectedBinds: ['mrn', 'lim', 'visitType'],
      build: (cfg) => {
        const rawSql = cfg['sql.visit.getByMrn']?.trim();
        if (rawSql) return rawSql;
        return buildVisitsByMrnSql(cfg);
      },
    },
    'reference.departments': {
      kind: 'query',
      expectedBinds: ['activeOnly'],
      build: (cfg) => {
        const rawSql = cfg['sql.reference.departments']?.trim();
        if (rawSql) return rawSql;
        return buildDepartmentsSql(cfg);
      },
    },
    'reference.doctors': {
      kind: 'query',
      expectedBinds: ['deptCode'],
      build: (cfg) => {
        const rawSql = cfg['sql.reference.doctors']?.trim();
        if (rawSql) return rawSql;
        return buildDoctorsSql(cfg);
      },
    },
    // D.5 extraction (2026-07-22): `BillingService.getBillById()`'s header
    // lookup reuses the SAME raw-override key as `billing.getBillsByMrn`
    // (`sql.billing.getBillsByMrn`) -- not a new key -- exactly matching
    // `BillingService`'s own existing (pre-D.5) direct-mode behavior of
    // wrapping that list query and filtering by billId. `mrn`/`lim` are
    // declared here because the raw-override branch wraps a query that
    // still contains those placeholders (BillingService supplies dummy
    // values for them); the config-built branch (`buildBillByIdSql`) only
    // ever references `billId`, so those two binds are simply unused, not
    // required, when no raw override is set for a tenant.
    'billing.getBillById': {
      kind: 'query',
      expectedBinds: ['billId', 'mrn', 'lim'],
      build: (cfg) => {
        const rawHeader = cfg['sql.billing.getBillsByMrn']?.trim();
        if (rawHeader) return `SELECT * FROM (${rawHeader}) WHERE "billId" = :billId`;
        return buildBillByIdSql(cfg);
      },
    },
    'billing.getLineItems': {
      kind: 'query',
      expectedBinds: ['billId'],
      build: (cfg) => {
        const rawItems = cfg['sql.billing.getLineItems']?.trim();
        if (rawItems) return rawItems;
        return buildBillItemsSql(cfg);
      },
    },
  };

  /** Every currently-registered queryId -- useful for a future Publisher (D.3) doing a full resync without needing its own copy of this list. */
  listQueryIds(): string[] {
    return Object.keys(this.registry);
  }

  /**
   * Compiles a tenant's concrete SQL for a given logical `queryId`.
   * Throws `UnknownQueryIdError` for an unregistered id, or
   * `IncompleteSchemaConfigError` if the tenant's config is missing a key
   * the builder needed.
   */
  async compile(
    tenantId: string,
    queryId: string,
    parameters: Record<string, unknown> = {},
  ): Promise<CompiledQueryDefinition> {
    const builder = this.registry[queryId];
    if (!builder) throw new UnknownQueryIdError(queryId);

    const cfg = await this.hisConfig.getConfig(tenantId);
    const sql = builder.build(cfg, parameters);

    if (sql.includes('undefined')) {
      throw new IncompleteSchemaConfigError(queryId, tenantId);
    }

    return {
      queryId,
      kind: builder.kind,
      sql,
      expectedBinds: builder.expectedBinds,
      checksum: HisQueryTemplateCompiler.computeChecksum(sql, builder.expectedBinds),
      compiledAt: new Date().toISOString(),
    };
  }

  /** SHA-256 of `sql` + its bind names, truncated to 16 hex chars -- see this class's doc comment and DYNAMIC_HIS_QUERY_ARCHITECTURE.md §6 for why this (not a counter) is the definition's real identity. */
  private static computeChecksum(sql: string, expectedBinds: string[]): string {
    return createHash('sha256')
      .update(sql)
      .update('|')
      .update(expectedBinds.join(','))
      .digest('hex')
      .slice(0, 16);
  }
}
