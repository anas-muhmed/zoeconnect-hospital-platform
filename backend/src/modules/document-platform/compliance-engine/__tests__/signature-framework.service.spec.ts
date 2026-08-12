import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SignatureFrameworkService } from '../services/signature-framework.service';
import { IntegrityEngineService } from '../services/integrity-engine.service';
import { DocumentSignatureEntity } from '../entities/document-signature.entity';

describe('SignatureFrameworkService', () => {
  let service: SignatureFrameworkService;
  let signatureRepo: any;
  let integrityEngine: any;
  let eventEmitter: any;

  beforeEach(async () => {
    signatureRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve({ ...dto, id: 'sig-123' })),
    };
    integrityEngine = {
      hashPayload: jest.fn().mockReturnValue('mock-hash'),
    };
    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignatureFrameworkService,
        { provide: getRepositoryToken(DocumentSignatureEntity), useValue: signatureRepo },
        { provide: IntegrityEngineService, useValue: integrityEngine },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<SignatureFrameworkService>(SignatureFrameworkService);
  });

  it('should capture a signature and emit evidence event', async () => {
    const params = {
      documentInstanceId: 'doc-1',
      actorId: 'user-1',
      actorName: 'Dr. Smith',
      signatureType: 'DRAWN' as any,
      intent: 'AUTHOR' as any,
      payload: 'base64data',
    };

    const result = await service.captureSignature(params);

    expect(integrityEngine.hashPayload).toHaveBeenCalledWith('base64data');
    expect(signatureRepo.create).toHaveBeenCalled();
    expect(signatureRepo.save).toHaveBeenCalled();
    
    expect(result.id).toBe('sig-123');
    expect(result.payloadHash).toBe('mock-hash');

    expect(eventEmitter.emit).toHaveBeenCalledWith('evidence.operation_recorded', {
      documentInstanceId: 'doc-1',
      operation: 'SIGNED',
      actorId: 'user-1',
      payload: {
        signatureId: 'sig-123',
        payloadHash: 'mock-hash',
        intent: 'AUTHOR',
      },
    });
  });
});
