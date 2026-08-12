import { Test, TestingModule } from '@nestjs/testing';
import { IntegrityEngineService } from '../services/integrity-engine.service';

describe('IntegrityEngineService', () => {
  let service: IntegrityEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IntegrityEngineService],
    }).compile();

    service = module.get<IntegrityEngineService>(IntegrityEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should hash payloads deterministically', () => {
    const payload1 = { a: 1, b: 2 };
    const payload2 = { b: 2, a: 1 };
    const payload3 = { a: 1, b: 3 };

    const hash1 = service.hashPayload(payload1);
    const hash2 = service.hashPayload(payload2);
    const hash3 = service.hashPayload(payload3);

    expect(hash1).toEqual(hash2);
    expect(hash1).not.toEqual(hash3);
  });

  it('should create chain hash correctly', () => {
    const payloadHash = 'testhash123';
    const previousHash = 'prevhash456';
    const timestamp = new Date();

    const chainHash = service.chainHash(payloadHash, previousHash, timestamp);
    
    expect(chainHash).toBeDefined();
    expect(chainHash.length).toBe(64); // SHA-256 hex length
  });
});
