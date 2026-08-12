import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ComplianceValidatorService } from '../services/compliance-validator.service';
import { ComplianceProfileEntity } from '../entities/compliance-profile.entity';
import { DocumentSignatureEntity } from '../entities/document-signature.entity';

describe('ComplianceValidatorService', () => {
  let service: ComplianceValidatorService;
  let profileRepo: any;
  let signatureRepo: any;

  beforeEach(async () => {
    profileRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'profile-1',
          policy: {
            signaturesRequired: [
              { intent: 'AUTHOR', count: 1 },
              { intent: 'REVIEWER', count: 1 },
            ],
          },
        }),
      }),
    };
    signatureRepo = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceValidatorService,
        { provide: getRepositoryToken(ComplianceProfileEntity), useValue: profileRepo },
        { provide: getRepositoryToken(DocumentSignatureEntity), useValue: signatureRepo },
      ],
    }).compile();

    service = module.get<ComplianceValidatorService>(ComplianceValidatorService);
  });

  it('should validate successfully when all required signatures are present', async () => {
    signatureRepo.find.mockResolvedValue([
      { intent: 'AUTHOR' },
      { intent: 'REVIEWER' },
    ]);

    const profile = await service.resolveActiveProfile({});
    const result = await service.validateForFinalization('doc-1', profile!);

    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('should fail validation when signatures are missing', async () => {
    signatureRepo.find.mockResolvedValue([
      { intent: 'AUTHOR' },
    ]);

    const profile = await service.resolveActiveProfile({});
    const result = await service.validateForFinalization('doc-1', profile!);

    expect(result.valid).toBe(false);
    expect(result.reasons[0]).toContain('Missing signatures for intent: REVIEWER');
  });
});
