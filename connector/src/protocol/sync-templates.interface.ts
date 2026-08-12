import type { SqlTemplateKind } from './sql-template-registry';

/**
 * SyncedTemplateDefinition (D.3, DYNAMIC_HIS_QUERY_ARCHITECTURE.md §5/§6).
 *
 * The shape carried by a `connector:sync-templates` push -- the cloud-side
 * `HisQueryDefinitionPublisherService` sends an array of these; the
 * connector-side `WebSocketMessageTransport.onTemplateSync()` receives
 * them and applies each to its local `SqlTemplateRegistry` via
 * `registerOrReplace()`.
 *
 * Deliberately a plain data shape, not `SqlTemplateDefinition` reused
 * directly: `definitionVersion`/`checksum` are sync-protocol metadata (see
 * `DYNAMIC_HIS_QUERY_ARCHITECTURE.md` §6 for what each field means and
 * why versioning is observability-only, never a trust decision), not part
 * of what `SqlTemplateRegistry.resolve()` needs to execute a request.
 */
export interface SyncedTemplateDefinition {
  queryId: string;
  sqlTemplateId: string;
  kind: SqlTemplateKind;
  sql: string;
  expectedBinds: string[];
  checksum: string;
  definitionVersion: number;
}
