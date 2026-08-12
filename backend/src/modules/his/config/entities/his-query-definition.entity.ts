import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { CompiledQueryKind } from '../his-query-template-compiler.service';

/**
 * HisQueryDefinition (D.3, DYNAMIC_HIS_QUERY_ARCHITECTURE.md §6/§7/§11).
 *
 * Persisted record of the last definition
 * `HisQueryDefinitionPublisherService` compiled and pushed for a given
 * `(tenantId, queryId)` pair -- the state a pure `HisQueryTemplateCompiler`
 * (D.2) has nothing to compare against, and the reason `definitionVersion`
 * lives here rather than on `CompiledQueryDefinition` itself.
 *
 * `checksum` is the definition's real identity (§6) -- `definitionVersion`
 * is only ever bumped when a fresh compile's checksum differs from the
 * row already here; an unchanged recompile (`HisSchemaConfig` invalidated
 * for an unrelated key, for instance) leaves this row, and
 * `definitionVersion`, untouched.
 *
 * One row per `(tenantId, queryId)` -- `sql`/`kind`/`expectedBinds` are
 * kept here too (not just the checksum) so a reconnecting Connector's full
 * resync (`HisQueryDefinitionPublisherService.publishFull()`) can be
 * served from this table without recompiling everything on every
 * reconnect.
 */
@Entity('his_query_definitions')
@Index('idx_his_query_definitions_tenant_query', ['tenantId', 'queryId'], { unique: true })
export class HisQueryDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'query_id', type: 'varchar', length: 100 })
  queryId: string;

  @Column({ type: 'varchar', length: 10 })
  kind: CompiledQueryKind;

  @Column({ type: 'text' })
  sql: string;

  @Column({ name: 'expected_binds', type: 'jsonb' })
  expectedBinds: string[];

  @Column({ type: 'varchar', length: 16 })
  checksum: string;

  @Column({ name: 'definition_version', type: 'integer', default: 1 })
  definitionVersion: number;

  /** Informational only -- see `CompiledQueryDefinition.compiledAt`'s doc comment (§6: never used for comparison/ordering). */
  @Column({ name: 'compiled_at', type: 'timestamptz' })
  compiledAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
