import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EvidenceChainListener } from '../services/evidence-chain.listener';
import { IntegrityEngineService } from '../services/integrity-engine.service';
import { EvidenceChainEntity } from '../entities/evidence-chain.entity';

describe('EvidenceChainListener', () => {
  let listener: EvidenceChainListener;
  let chainRepo: any;
  let integrityEngine: any;

  beforeEach(async () => {
    chainRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockResolvedValue(true),
    };
    integrityEngine = {
      hashPayload: jest.fn().mockReturnValue('payload-hash'),
      chainHash: jest.fn().mockReturnValue('new-chain-hash'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceChainListener,
        { provide: getRepositoryToken(EvidenceChainEntity), useValue: chainRepo },
        { provide: IntegrityEngineService, useValue: integrityEngine },
      ],
    }).compile();

    listener = module.get<EvidenceChainListener>(EvidenceChainListener);
  });

  it('should append evidence to the chain with GENESIS if no previous hash', async () => {
    chainRepo.findOne.mockResolvedValue(null); // No previous entry

    await listener.handleEvidenceRecorded({
      documentInstanceId: 'doc-1',
      operation: 'CREATED',
      actorId: 'user-1',
      payload: 'test-payload',
    });

    expect(integrityEngine.hashPayload).toHaveBeenCalledWith('test-payload');
    expect(integrityEngine.chainHash).toHaveBeenCalledWith('payload-hash', null, expect.any(Date));

    expect(chainRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      documentInstanceId: 'doc-1',
      operation: 'CREATED',
      actorId: 'user-1',
      payloadHash: 'payload-hash',
      previousHash: null,
      chainHash: 'new-chain-hash',
    }));
    expect(chainRepo.save).toHaveBeenCalled();
  });

  it('should append evidence to the chain using the previous hash', async () => {
    chainRepo.findOne.mockResolvedValue({ chainHash: 'old-chain-hash' });

    await listener.handleEvidenceRecorded({
      documentInstanceId: 'doc-1',
      operation: 'SIGNED',
      actorId: 'user-2',
      payload: 'test-signature',
    });

    expect(integrityEngine.chainHash).toHaveBeenCalledWith('payload-hash', 'old-chain-hash', expect.any(Date));

    expect(chainRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      previousHash: 'old-chain-hash',
      chainHash: 'new-chain-hash',
    }));
  });
});
