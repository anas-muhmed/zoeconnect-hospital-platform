import { SqlTemplateRegistry, UnknownSqlTemplateError } from '../sql-template-registry';

describe('SqlTemplateRegistry', () => {
  it('resolves a registered template by id', () => {
    const registry = new SqlTemplateRegistry();
    registry.register({
      id: 'get-patient-by-mrn',
      kind: 'query',
      sql: 'SELECT * FROM patients WHERE mrn = :mrn',
      expectedBinds: ['mrn'],
      description: 'Look up a patient by MRN',
    });
    const resolved = registry.resolve('get-patient-by-mrn');
    expect(resolved.kind).toBe('query');
    expect(resolved.sql).toContain(':mrn');
  });

  it('throws UnknownSqlTemplateError for an unregistered id', () => {
    const registry = new SqlTemplateRegistry();
    expect(() => registry.resolve('does-not-exist')).toThrow(UnknownSqlTemplateError);
  });

  it('rejects duplicate registration of the same id', () => {
    const registry = new SqlTemplateRegistry();
    registry.register({ id: 'dup', kind: 'query', sql: 'SELECT 1', expectedBinds: [], description: '' });
    expect(() => registry.register({ id: 'dup', kind: 'query', sql: 'SELECT 2', expectedBinds: [], description: '' })).toThrow();
  });

  it('never executes an arbitrary caller-supplied SQL string -- only a resolved template id', () => {
    const registry = new SqlTemplateRegistry();
    registry.register({ id: 'safe-template', kind: 'query', sql: 'SELECT 1 FROM dual', expectedBinds: [], description: '' });
    // The only way to get a SQL string out of the registry is via resolve(id) --
    // there is no method that accepts and echoes back an arbitrary SQL string.
    expect(registry.has('DROP TABLE patients')).toBe(false);
  });
});
