# 3. Stage B Tenant Isolation

Date: 2026-08-02
Status: Accepted

## Context
Children's Village must support multi-tenancy. HDSP utilizes "Stage B" tenant isolation, meaning all data resides in shared tables, but every row contains a `tenant_id` column.

## Decision
All database interactions within Children's Village use the `TenantScopedRepository` pattern via `createTenantScopedRepositoryProvider`. Write operations use the standard TypeORM `Repository` combined with a `TenantContextStorage` injection to explicitly apply the active tenant ID before saving.

## Consequences
- **Positive**: Strict data isolation. A tenant cannot accidentally fetch another tenant's data.
- **Positive**: Compliant with HDSP platform architecture.
- **Negative**: Requires discipline from developers to always use the custom repository tokens for reads and explicitly append `tenantId` for writes.
