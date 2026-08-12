/**
 * Phase 7 ("Cloud Oracle Transport", Task 7.3) — IOracleTransport
 * conformance suite, run against both DirectOracleTransport and
 * CloudOracleTransport in CI's normal unit-test step. No live Oracle or
 * Redis needed — OraclePoolService and RedisMessageTransport.send() are
 * both mocked, matching the mocked-dependency pattern used for Phase 4/5's
 * conformance suites (no live-service emulator readily available for
 * Oracle, unlike Phase 3's MinIO).
 *
 * Honest scope note (see cloud-oracle.transport.ts's doc comment): this
 * suite does NOT claim byte-identical behavior for arbitrary raw SQL
 * across both transports. `CloudOracleTransport` only supports queries
 * pre-registered in its `knownTemplates` map (Phase 6's SQL-template
 * allow-list is a deliberate security boundary, not a Phase 7 shortcut).
 * For the one shared, allow-listed conformance query
 * ("SELECT 1 FROM dual"), both transports are proven to return the same
 * shaped result and the same error-handling contract
 * (`HisUnavailableError` for retryable failures). For an arbitrary
 * non-registered query, Direct executes it (as it always has) while Cloud
 * correctly refuses — that divergence is asserted explicitly below, not
 * hidden.
 */
import { DirectOracleTransport } from '../direct-oracle.transport';
import { CloudOracleTransport, UnregisteredCloudQueryError } from '../cloud-oracle.transport';
import { OraclePoolService, HisUnavailableError } from '../oracle-pool.service';
import { RedisMessageTransport, MessageTransportResponse } from '@hdsp/connector';
import type { IOracleTransport } from '../../platform/infrastructure/oracle/oracle-transport.interface';

// CloudOracleTransport's constructor builds a real RedisMessageTransport,
// which itself constructs real ioredis clients that would otherwise try to
// open real sockets (and retry indefinitely) in a CI environment with no
// Redis available. Mocking ioredis at the module level -- rather than only
// stubbing RedisMessageTransport.prototype.send() -- keeps this suite
// fully offline, matching Phase 5's approach of mocking the AWS SDK client
// constructors themselves, not just their methods.
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    duplicate: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
  }));
});

const CONFORMANCE_SQL = 'SELECT 1 FROM dual';

describe('IOracleTransport conformance', () => {
  describe('DirectOracleTransport', () => {
    function makePool(): OraclePoolService {
      return {
        isAvailable: true,
        query: jest.fn().mockResolvedValue([{ result: 1 }]),
        queryOne: jest.fn().mockResolvedValue({ result: 1 }),
        execute: jest.fn().mockResolvedValue(1),
        reconfigure: jest.fn().mockResolvedValue({ ok: true, message: 'reconfigured' }),
      } as unknown as OraclePoolService;
    }

    it('conforms to IOracleTransport and delegates verbatim to OraclePoolService', async () => {
      const pool = makePool();
      const transport: IOracleTransport = new DirectOracleTransport(pool);
      expect(transport.isAvailable).toBe(true);
      const rows = await transport.query(CONFORMANCE_SQL);
      expect(rows).toEqual([{ result: 1 }]);
      expect(pool.query).toHaveBeenCalledWith(CONFORMANCE_SQL, {}, {});
    });

    it('executes an arbitrary, non-registered SQL string unchanged (its existing, unrestricted behavior)', async () => {
      const pool = makePool();
      const transport: IOracleTransport = new DirectOracleTransport(pool);
      await expect(transport.query('SELECT * FROM some_arbitrary_table WHERE 1=1')).resolves.toEqual([{ result: 1 }]);
    });

    it('propagates HisUnavailableError unchanged', async () => {
      const pool = makePool();
      (pool.query as jest.Mock).mockRejectedValue(new HisUnavailableError());
      const transport: IOracleTransport = new DirectOracleTransport(pool);
      await expect(transport.query(CONFORMANCE_SQL)).rejects.toBeInstanceOf(HisUnavailableError);
    });
  });

  describe('CloudOracleTransport', () => {
    afterEach(() => jest.restoreAllMocks());

    it('conforms to IOracleTransport for the one shared conformance query', async () => {
      jest.spyOn(RedisMessageTransport.prototype, 'send').mockResolvedValue({
        correlationId: 'c1', ok: true, rows: [{ result: 1 }],
      } as MessageTransportResponse);

      const transport: IOracleTransport = new CloudOracleTransport();
      const rows = await transport.query(CONFORMANCE_SQL);
      expect(rows).toEqual([{ result: 1 }]);
    });

    it('returns the same shaped result as DirectOracleTransport for the shared conformance query', async () => {
      jest.spyOn(RedisMessageTransport.prototype, 'send').mockResolvedValue({
        correlationId: 'c2', ok: true, rows: [{ result: 1 }],
      } as MessageTransportResponse);
      const cloud: IOracleTransport = new CloudOracleTransport();

      const pool = {
        isAvailable: true,
        query: jest.fn().mockResolvedValue([{ result: 1 }]),
      } as unknown as OraclePoolService;
      const direct: IOracleTransport = new DirectOracleTransport(pool);

      const [cloudRows, directRows] = await Promise.all([cloud.query(CONFORMANCE_SQL), direct.query(CONFORMANCE_SQL)]);
      expect(cloudRows).toEqual(directRows);
    });

    it('refuses a non-registered SQL string (deliberate divergence from Direct — see suite doc comment)', async () => {
      const transport = new CloudOracleTransport();
      await expect(transport.query('SELECT * FROM some_arbitrary_table WHERE 1=1')).rejects.toBeInstanceOf(UnregisteredCloudQueryError);
    });

    it('maps a retryable error response to HisUnavailableError — same exception type as DirectOracleTransport', async () => {
      jest.spyOn(RedisMessageTransport.prototype, 'send').mockResolvedValue({
        correlationId: 'c3', ok: false, error: { message: 'Connector unavailable', retryable: true },
      } as MessageTransportResponse);

      const transport: IOracleTransport = new CloudOracleTransport();
      await expect(transport.query(CONFORMANCE_SQL)).rejects.toBeInstanceOf(HisUnavailableError);
    });

    it('maps a non-retryable error response to a plain Error, not HisUnavailableError', async () => {
      jest.spyOn(RedisMessageTransport.prototype, 'send').mockResolvedValue({
        correlationId: 'c4', ok: false, error: { message: 'Oracle rejected the query', retryable: false },
      } as MessageTransportResponse);

      const transport: IOracleTransport = new CloudOracleTransport();
      await expect(transport.query(CONFORMANCE_SQL)).rejects.not.toBeInstanceOf(HisUnavailableError);
    });

    it('trips its circuit breaker on a transport-level failure (Task 7.4 parity)', async () => {
      jest.spyOn(RedisMessageTransport.prototype, 'send').mockRejectedValue(new Error('Redis unreachable'));

      const transport = new CloudOracleTransport();
      await expect(transport.query(CONFORMANCE_SQL)).rejects.toBeInstanceOf(HisUnavailableError);
      expect(transport.isAvailable).toBe(false);
    });

    it('reconfigure() honestly reports it is not supported in cloud_relay mode', async () => {
      const transport: IOracleTransport = new CloudOracleTransport();
      const result = await transport.reconfigure({ 'db.host': 'h' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('not supported');
    });
  });
});
