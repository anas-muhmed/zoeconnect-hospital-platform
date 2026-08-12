import { DatabaseBackupProviderRegistry } from '../providers/database-backup-provider.registry';
import { PostgresBackupProvider } from '../providers/postgres-backup.provider';

describe('DatabaseBackupProviderRegistry', () => {
  function createRegistry(databaseType?: string) {
    const configService = { get: jest.fn().mockReturnValue(databaseType) } as any;
    const postgresProvider = { type: 'postgres' } as unknown as PostgresBackupProvider;
    const registry = new DatabaseBackupProviderRegistry(configService, postgresProvider);
    return { registry, postgresProvider, configService };
  }

  it("returns the PostgresBackupProvider for databaseType='postgres'", () => {
    const { registry, postgresProvider } = createRegistry('postgres');
    expect(registry.getActiveProvider()).toBe(postgresProvider);
  });

  it('defaults to postgres when backup.databaseType is not configured', () => {
    const { registry, postgresProvider } = createRegistry(undefined);
    expect(registry.getActiveProvider()).toBe(postgresProvider);
  });

  it('throws a clear, actionable error for an unsupported database type', () => {
    const { registry } = createRegistry('mysql');
    expect(() => registry.getActiveProvider()).toThrow("Database type 'mysql' is not yet supported");
  });
});
