import { OracleClient, HisUnavailableError } from '../oracle-client';

describe('OracleClient', () => {
  it('is unavailable before connect() is called', () => {
    const client = new OracleClient({ user: 'u', password: 'p', host: 'h', service: 's' });
    expect(client.isAvailable).toBe(false);
  });

  it('query() throws HisUnavailableError when the pool was never created', async () => {
    const client = new OracleClient({ user: 'u', password: 'p', host: 'h', service: 's' });
    await expect(client.query('SELECT 1 FROM dual')).rejects.toBeInstanceOf(HisUnavailableError);
  });

  it('execute() throws HisUnavailableError when the pool was never created', async () => {
    const client = new OracleClient({ user: 'u', password: 'p', host: 'h', service: 's' });
    await expect(client.execute('UPDATE t SET x=1')).rejects.toBeInstanceOf(HisUnavailableError);
  });

  it('reconfigure() rejects when required credential fields are missing', async () => {
    const client = new OracleClient({ user: 'u', password: 'p', host: 'h', service: 's' });
    const result = await client.reconfigure({ host: 'h' }); // missing service/user/password
    expect(result.ok).toBe(false);
  });

  it('connectedTarget starts as "(not connected)"', () => {
    const client = new OracleClient({ user: 'u', password: 'p', host: 'h', service: 's' });
    expect(client.connectedTarget).toBe('(not connected)');
  });
});
