import { PgDockerDetectionService } from '../services/pg-docker-detection.service';

describe('PgDockerDetectionService', () => {
  const configService = { get: jest.fn().mockReturnValue(undefined) } as any;
  const service = new PgDockerDetectionService(configService);

  describe('parseComposeForPostgresService() -- docker-compose.yml heuristic scan', () => {
    it('finds the postgres service by image prefix + matching host:container port mapping', () => {
      const compose = `
version: "3.8"
services:
  app:
    image: node:20
    ports:
      - "3000:3000"
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
  redis:
    image: redis:7
    ports:
      - "6379:6379"
`;
      expect(service.parseComposeForPostgresService(compose, 5432)).toBe('db');
    });

    it('matches on the CONTAINER-side port even if the host-side port is remapped', () => {
      const compose = `
services:
  postgresql:
    image: postgres:15
    ports:
      - "15432:5432"
`;
      expect(service.parseComposeForPostgresService(compose, 5432)).toBe('postgresql');
    });

    it('matches a bare (no host mapping) port entry', () => {
      const compose = `
services:
  pg:
    image: postgres:latest
    ports:
      - "5432"
`;
      expect(service.parseComposeForPostgresService(compose, 5432)).toBe('pg');
    });

    it('returns null when no service has a postgres-prefixed image', () => {
      const compose = `
services:
  app:
    image: node:20
    ports:
      - "3000:3000"
`;
      expect(service.parseComposeForPostgresService(compose, 5432)).toBeNull();
    });

    it('returns null when the postgres service exists but its port does not match', () => {
      const compose = `
services:
  db:
    image: postgres:16
    ports:
      - "5433:5433"
`;
      expect(service.parseComposeForPostgresService(compose, 5432)).toBeNull();
    });

    it('ignores a namespaced/registry-qualified image (e.g. "myregistry.io/postgres:16") by matching the trailing image name', () => {
      const compose = `
services:
  db:
    image: myregistry.io/postgres:16
    ports:
      - "5432:5432"
`;
      expect(service.parseComposeForPostgresService(compose, 5432)).toBe('db');
    });

    it('does not match an image that merely contains "postgres" mid-string but does not start with it (e.g. "my-postgres-app")', () => {
      const compose = `
services:
  db:
    image: my-postgres-app:latest
    ports:
      - "5432:5432"
`;
      expect(service.parseComposeForPostgresService(compose, 5432)).toBeNull();
    });
  });

  describe('parseDockerPsOutput() -- `docker ps` output scan', () => {
    it('finds a running postgres container by image + port mapping', () => {
      const out = [
        'app_web_1\tnode:20\t0.0.0.0:3000->3000/tcp',
        'app_db_1\tpostgres:16-alpine\t0.0.0.0:5432->5432/tcp, :::5432->5432/tcp',
      ].join('\n');
      expect(service.parseDockerPsOutput(out, 5432)).toBe('app_db_1');
    });

    it('returns null when no running container has a matching postgres image', () => {
      const out = 'app_web_1\tnode:20\t0.0.0.0:3000->3000/tcp';
      expect(service.parseDockerPsOutput(out, 5432)).toBeNull();
    });

    it('returns null when the postgres container is running but its port does not match', () => {
      const out = 'app_db_1\tpostgres:16\t0.0.0.0:5433->5432/tcp';
      // 5432 matches the container-side port here, so pick a genuinely non-matching target instead.
      expect(service.parseDockerPsOutput(out, 9999)).toBeNull();
    });
  });

  describe('detect() -- never throws', () => {
    it('resolves { containerName: null, source: null } when nothing is found anywhere (no compose file, docker CLI unavailable)', async () => {
      const result = await service.detect();
      expect(result).toEqual(expect.objectContaining({ containerName: null }));
    });
  });
});
