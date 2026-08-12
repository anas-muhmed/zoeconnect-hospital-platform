import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceProfileEntity } from '../entities/compliance-profile.entity';
import { DocumentSignatureEntity } from '../entities/document-signature.entity';

@Injectable()
export class ComplianceValidatorService {
  private readonly logger = new Logger(ComplianceValidatorService.name);

  constructor(
    @InjectRepository(ComplianceProfileEntity)
    private readonly profileRepo: Repository<ComplianceProfileEntity>,
    @InjectRepository(DocumentSignatureEntity)
    private readonly signatureRepo: Repository<DocumentSignatureEntity>
  ) {}

  /**
   * Resolves the active compliance profile for a given context hierarchically.
   * Order: Workflow -> DocumentType -> Department -> Hospital
   */
  async resolveActiveProfile(context: {
    hospitalId?: string;
    departmentCode?: string;
    documentTypeId?: string;
    workflowTemplateId?: string;
  }): Promise<ComplianceProfileEntity | null> {
    const qb = this.profileRepo.createQueryBuilder('profile')
      .where('profile.workflowTemplateId = :workflowId', { workflowId: context.workflowTemplateId })
      .orWhere('profile.documentTypeId = :typeId', { typeId: context.documentTypeId })
      .orWhere('profile.departmentCode = :dept', { dept: context.departmentCode })
      .orWhere('profile.hospitalId = :hosp', { hosp: context.hospitalId })
      .orWhere('profile.name = :defaultName', { defaultName: 'Default' })
      .orderBy('profile.precedence', 'DESC');

    const profile = await qb.getOne();
    return profile || null;
  }

  /**
   * Validates if a document instance meets its compliance policy requirements for finalization.
   */
  async validateForFinalization(
    instanceId: string, 
    profile: ComplianceProfileEntity
  ): Promise<{ valid: boolean; reasons: string[] }> {
    const signatures = await this.signatureRepo.find({
      where: { documentInstanceId: instanceId }
    });

    const reasons: string[] = [];
    const policy = profile.policy;

    if (policy.signaturesRequired) {
      for (const req of policy.signaturesRequired) {
        const matchingSigs = signatures.filter(s => s.intent === req.intent);
        if (matchingSigs.length < req.count) {
          reasons.push(`Missing signatures for intent: ${req.intent}. Required: ${req.count}, Found: ${matchingSigs.length}`);
        }
      }
    }

    if (reasons.length > 0) {
      return { valid: false, reasons };
    }

    return { valid: true, reasons: [] };
  }
}
