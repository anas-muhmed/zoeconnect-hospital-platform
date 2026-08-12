/**
 * SqlTemplateRegistry (Phase 6 "Connector", Task 6.2).
 *
 * Spec Section 7.2's SQL-template allow-list: the Connector never accepts
 * or executes an arbitrary SQL string sent over the Message Transport --
 * only a `sqlTemplateId` it already knows about, resolved to a
 * pre-registered, reviewed SQL statement. This is the boundary that keeps
 * a compromised or buggy caller from running arbitrary SQL against the
 * on-prem Oracle HIS instance through the Connector.
 *
 * A template's `kind` ('query' | 'execute') determines whether the
 * Connector calls `OracleClient.query()`/`queryOne()` or `execute()` --
 * the Message Transport response shape (`rows` vs `rowsAffected`) is
 * derived from this, not from anything the caller specifies.
 */
export type SqlTemplateKind = 'query' | 'execute';

export interface SqlTemplateDefinition {
  id: string;
  kind: SqlTemplateKind;
  sql: string;
  /** Documents which bind names this template expects -- not enforced at
   * runtime in this phase (no caller exists yet to validate against), but
   * recorded so a template's contract is self-describing. */
  expectedBinds: string[];
  description: string;
}

export class UnknownSqlTemplateError extends Error {
  constructor(sqlTemplateId: string) {
    super(`Unknown or unregistered SQL template: "${sqlTemplateId}"`);
    this.name = 'UnknownSqlTemplateError';
  }
}

export class SqlTemplateRegistry {
  private readonly templates = new Map<string, SqlTemplateDefinition>();

  register(definition: SqlTemplateDefinition): void {
    if (this.templates.has(definition.id)) {
      throw new Error(`SQL template "${definition.id}" is already registered — IDs must be unique`);
    }
    this.templates.set(definition.id, definition);
  }

  /**
   * Register-or-replace (D.3, DYNAMIC_HIS_QUERY_ARCHITECTURE.md §5) --
   * used for templates pushed live via `connector:sync-templates`, which
   * legitimately need to update an existing id when a tenant's
   * `HisSchemaConfig` changes. `register()`'s throw-on-duplicate stays the
   * only entry point for the build-time conformance templates in
   * `index.ts`, which should never legitimately collide; this method is
   * for the sync path only, kept separate so a duplicate-id bug in the
   * static conformance set still fails loudly instead of being silently
   * swallowed by whichever method happened to run second.
   */
  registerOrReplace(definition: SqlTemplateDefinition): void {
    this.templates.set(definition.id, definition);
  }

  resolve(sqlTemplateId: string): SqlTemplateDefinition {
    const template = this.templates.get(sqlTemplateId);
    if (!template) {
      throw new UnknownSqlTemplateError(sqlTemplateId);
    }
    return template;
  }

  has(sqlTemplateId: string): boolean {
    return this.templates.has(sqlTemplateId);
  }

  list(): SqlTemplateDefinition[] {
    return Array.from(this.templates.values());
  }
}
