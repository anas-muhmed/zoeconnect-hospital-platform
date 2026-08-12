/**
 * his-config.helpers.ts
 *
 * Shared SQL-building utilities for all HIS services.
 *
 * Many Oracle HIS installations normalize lookup data into master tables.
 * Instead of storing "Mr" directly in PAT_MASTER.SALUTATION, they store
 * a foreign-key ID (e.g. PREFIX_ID = 3) that references PREFIX_MASTER.
 *
 * These helpers transparently handle both cases:
 *   • Plain column  — cfg key present, no lookup config → p.COLUMN_NAME
 *   • FK + join     — lookup config present             → lkp.VALUE_COLUMN
 *                     with a LEFT JOIN clause injected into FROM
 *
 * Usage in a service:
 *
 *   const cfg = await this.hisConfig.getConfig();
 *
 *   const salExpr = resolveColumn(cfg, 'patient', 'salutation', 'p', 'lkp_sal');
 *   const salJoin = buildLookupJoin(cfg, 'patient', 'salutation', 'p', 'lkp_sal');
 *
 *   const sql = `
 *     SELECT ${salExpr} AS "salutation", ...
 *     FROM PAT_MASTER p
 *     ${salJoin}
 *   `;
 *
 * Config key convention for a lookup-backed field:
 *   <domain>.col.<field>             — FK column in the parent table  (always required)
 *   <domain>.lookup.<field>.table   — name of the master/lookup table (opt — triggers join)
 *   <domain>.lookup.<field>.fk      — PK column in the lookup table
 *   <domain>.lookup.<field>.value   — text/display column in the lookup table
 *
 * Example (salutation stored as ID):
 *   patient.col.salutation           = PREFIX_ID
 *   patient.lookup.salutation.table  = PREFIX_MASTER
 *   patient.lookup.salutation.fk     = PREFIX_ID
 *   patient.lookup.salutation.value  = PREFIX_NAME
 *
 * Example (salutation stored as plain text — no join needed):
 *   patient.col.salutation           = SALUTATION
 *   (no lookup keys set)
 */

/**
 * Returns the SELECT expression for a potentially FK-backed column.
 *
 * @param cfg          Full config map from HisConfigService.getConfig()
 * @param domain       Config domain  — e.g. "patient", "billing"
 * @param field        Field name     — e.g. "salutation", "dept"
 * @param parentAlias  SQL alias for the parent table  — e.g. "p", "b"
 * @param lookupAlias  SQL alias for the lookup table  — e.g. "lkp_sal"
 *                     (required when a lookup might be configured)
 *
 * @returns
 *   "lkp_sal.PREFIX_NAME"  when lookup is configured
 *   "p.SALUTATION"         when no lookup (plain column)
 */
export function resolveColumn(
  cfg: Record<string, string>,
  domain: string,
  field: string,
  parentAlias: string,
  lookupAlias: string,
): string {
  const lookupTable = cfg[`${domain}.lookup.${field}.table`];
  if (lookupTable) {
    const valueCol = cfg[`${domain}.lookup.${field}.value`];
    return `${lookupAlias}.${valueCol}`;
  }
  const col = cfg[`${domain}.col.${field}`];
  return `${parentAlias}.${col}`;
}

/**
 * Returns a LEFT JOIN clause when a lookup is configured, otherwise ''.
 *
 * @param cfg          Full config map
 * @param domain       e.g. "patient"
 * @param field        e.g. "salutation"
 * @param parentAlias  e.g. "p"
 * @param lookupAlias  e.g. "lkp_sal"
 *
 * @returns
 *   "LEFT JOIN PREFIX_MASTER lkp_sal ON lkp_sal.PREFIX_ID = p.PREFIX_ID"
 *   or "" if no lookup configured
 */
export function buildLookupJoin(
  cfg: Record<string, string>,
  domain: string,
  field: string,
  parentAlias: string,
  lookupAlias: string,
): string {
  const lookupTable = cfg[`${domain}.lookup.${field}.table`];
  if (!lookupTable) return '';

  const lookupFk  = cfg[`${domain}.lookup.${field}.fk`];   // PK in lookup table
  const parentFk  = cfg[`${domain}.col.${field}`];          // FK col in parent table

  return `LEFT JOIN ${lookupTable} ${lookupAlias} ON ${lookupAlias}.${lookupFk} = ${parentAlias}.${parentFk}`;
}

/**
 * Convenience: build multiple join clauses and filter empty strings.
 * Returns a single string with all active joins separated by newlines.
 *
 * @param joins   Array of [domain, field, parentAlias, lookupAlias] tuples
 */
export function buildLookupJoins(
  cfg: Record<string, string>,
  joins: Array<[string, string, string, string]>,
): string {
  return joins
    .map(([domain, field, parentAlias, lookupAlias]) =>
      buildLookupJoin(cfg, domain, field, parentAlias, lookupAlias),
    )
    .filter(Boolean)
    .join('\n      ');
}
