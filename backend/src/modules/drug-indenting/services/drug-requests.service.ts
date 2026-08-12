import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DrugRequest } from '../entities/drug-request.entity';
import { DrugAlternative } from '../entities/drug-alternative.entity';
import { DrugAlternativeNegotiation } from '../entities/drug-alternative-negotiation.entity';
import { BlacklistedCompany } from '../entities/blacklisted-company.entity';
import { UserRequestQuota } from '../entities/user-request-quota.entity';
import { DrugAuditLog } from '../entities/drug-audit-log.entity';
import { DrugIndentingStaffProfile } from '../entities/drug-indenting-staff-profile.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { DrugIndentingRequestContext, canActAsWorkflowRole } from '../drug-indenting-request-context';
import { WORKFLOW_ROLES, NEXT_STAGE, STAGES, getApproverRoleForStage } from '../drug-indenting-workflow.util';
import {
  SubmitDrugRequestDto, SubmitPharmacistDrugRequestDto, SubmitEmergencyDrugRequestDto,
} from '../dto/submit-drug-request.dto';
import {
  ApproveDrugRequestDto, RejectDrugRequestDto, InitialReviewApproveDto,
  UpdateDrugInfoDto, RevertDrugRequestDto, MarkInventoryAddedDto,
} from '../dto/workflow-action.dto';
import { ResubmitCorrectionDto } from '../dto/resubmit-correction.dto';
import { computeAltDerived } from '../drug-indenting-pure-helpers.util';

const PENDING_STATUSES = new Set([
  'Pending', 'EMERGENCY_PENDING_DTC', 'PENDING_HOD', 'HOD_APPROVED',
  'PHARMACY_HEAD_REJECTED_PENDING_DTC', 'PHARMACIST_REJECTED_PENDING_DTC', 'REVERTED_BY_DTC',
]);

const REMARKS_COLUMN_BY_STAGE: Record<string, keyof DrugRequest> = {
  HOD: 'hodRemarks',
  PharmacistInitialReview: 'pharmacistRemarks',
  PharmacyHead: 'phRemarks',
  DTCCommittee: 'dtcRemarks',
  Pharmacist: 'pharmacistRemarks',
  PharmacyHeadReview2: 'phRemarks2',
  DTCFinal: 'dtcFinalRemarks',
  EmergencyDTC: 'dtcRemarks',
  CEO: 'ceoRemarks',
};

/**
 * Drug Indenting integration (delivery phase). Ports the core workflow
 * engine from `routes/requests.js` (submit/list/approve/reject/review/
 * correction/emergency/order/inventory/revert/resubmit).
 *
 * Deliberately NOT ported in this pass (documented delivery-phase scope
 * cuts, all deferred features rather than silently dropped business
 * rules): in-app notifications (`createNotification*` — ZoeConnect's own
 * NotificationModule wiring is a separate decision), approval/rejection
 * remark-history autocomplete (`saveApprovalRemarks`,
 * `rejection_remark_history`), per-drug `drug_effective_entries` override
 * sub-table on initial review (the top-level `effectiveCreatedAt` column
 * IS preserved — only the per-entry breakdown table is deferred),
 * `analysis_drafts` cleanup on resubmit, `drug_existing_details` remarks.
 */
@Injectable()
export class DrugRequestsService {
  constructor(
    @InjectRepository(DrugRequest)
    private readonly requestRepo: Repository<DrugRequest>,
    @Inject(getTenantScopedRepositoryToken(DrugRequest))
    private readonly scopedRequestRepo: TenantScopedRepository<DrugRequest>,
    @InjectRepository(DrugAlternative)
    private readonly altRepo: Repository<DrugAlternative>,
    @Inject(getTenantScopedRepositoryToken(DrugAlternative))
    private readonly scopedAltRepo: TenantScopedRepository<DrugAlternative>,
    @InjectRepository(DrugAlternativeNegotiation)
    private readonly negRepo: Repository<DrugAlternativeNegotiation>,
    @Inject(getTenantScopedRepositoryToken(DrugAlternativeNegotiation))
    private readonly scopedNegRepo: TenantScopedRepository<DrugAlternativeNegotiation>,
    @Inject(getTenantScopedRepositoryToken(BlacklistedCompany))
    private readonly scopedBlacklistRepo: TenantScopedRepository<BlacklistedCompany>,
    @InjectRepository(UserRequestQuota)
    private readonly quotaRepo: Repository<UserRequestQuota>,
    @Inject(getTenantScopedRepositoryToken(UserRequestQuota))
    private readonly scopedQuotaRepo: TenantScopedRepository<UserRequestQuota>,
    @InjectRepository(DrugAuditLog)
    private readonly auditRepo: Repository<DrugAuditLog>,
    @Inject(getTenantScopedRepositoryToken(DrugIndentingStaffProfile))
    private readonly scopedStaffProfileRepo: TenantScopedRepository<DrugIndentingStaffProfile>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ── Shared helpers ──────────────────────────────────────────────────

  private async writeAudit(
    tenantId: string, requestId: string, action: string, performedBy: string,
    fromStage: string | null, toStage: string | null, remarks?: string | null,
  ): Promise<void> {
    await this.auditRepo.insert({
      tenantId, requestId, action, performedBy, fromStage, toStage, remarks: remarks || null,
    });
  }

  private async checkBlacklist(tenantId: string, manufacturer: string, marketer: string) {
    const hit = await this.scopedBlacklistRepo.findOneBy([
      { tenantId, isActive: true, companyType: 'MANUFACTURER', companyName: (manufacturer || '').trim().toUpperCase() },
      { tenantId, isActive: true, companyType: 'MARKETER', companyName: (marketer || '').trim().toUpperCase() },
    ]);
    return hit;
  }

  private async ensureQuotaExists(tenantId: string, userId: string): Promise<void> {
    const existing = await this.scopedQuotaRepo.findOneBy({ tenantId, userId });
    if (!existing) {
      await this.quotaRepo.insert({ tenantId, userId, quarterlyLimit: 10, updatedBy: userId });
    }
  }

  private async checkQuota(tenantId: string, userId: string): Promise<void> {
    await this.ensureQuotaExists(tenantId, userId);
    const quota = await this.scopedQuotaRepo.findOneBy({ tenantId, userId });
    const startOfQuarter = new Date();
    const qMonth = Math.floor(startOfQuarter.getMonth() / 3) * 3;
    startOfQuarter.setMonth(qMonth, 1);
    startOfQuarter.setHours(0, 0, 0, 0);
    const endOfQuarter = new Date(startOfQuarter);
    endOfQuarter.setMonth(endOfQuarter.getMonth() + 3);

    const used = await this.requestRepo
      .createQueryBuilder('dr')
      .where('dr.tenantId = :tenantId', { tenantId })
      .andWhere('dr.createdByUserId = :userId', { userId })
      .andWhere('dr.createdAt >= :start AND dr.createdAt < :end', { start: startOfQuarter, end: endOfQuarter })
      .getCount();

    if (used >= (quota?.quarterlyLimit ?? 10)) {
      throw new BadRequestException('Quarterly request quota exceeded.');
    }
  }

  private async findHodForDepartment(tenantId: string, department: string): Promise<string | null> {
    const rows = await this.dataSource.query(
      `SELECT u.id AS user_id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         JOIN drug_indenting_staff_profiles p ON p.user_id = u.id AND p.tenant_id = $1
        WHERE r.tenant_id = $1 AND r.name = 'DRUG_HOD' AND u.is_active = true
          AND UPPER(TRIM(p.department)) = UPPER(TRIM($2))
        LIMIT 1`,
      [tenantId, department],
    );
    return rows.length > 0 ? rows[0].user_id : null;
  }

  // ── Submission ───────────────────────────────────────────────────────

  /**
   * Ports `POST /` (doctor/HOD self-submission). `doctorId` is always the
   * caller (`ctx.userId`), never a client-supplied value — same
   * accountability rule as the source (`req.user.id !== doctor_id` check).
   */
  async submit(ctx: DrugIndentingRequestContext, dto: SubmitDrugRequestDto): Promise<{ requestId: string }> {
    const sourceType = (dto.requestSourceType || 'PROMOTIONAL').toUpperCase();
    const isPromotional = sourceType === 'PROMOTIONAL';

    if (dto.medicineQuantity === undefined && !isPromotional) {
      throw new BadRequestException(`Field 'medicineQuantity' is required for Non-Promotional requests.`);
    }
    if (isPromotional && (!dto.medRepName || !dto.medRepEmail || !dto.medRepPhone)) {
      throw new BadRequestException('Med rep name/email/phone are required for Promotional requests.');
    }

    await this.checkQuota(ctx.tenantId, ctx.userId);

    const blHit = await this.checkBlacklist(ctx.tenantId, dto.manufacturer, dto.marketer);
    if (blHit) {
      throw new BadRequestException(`Request denied. ${blHit.companyType === 'MANUFACTURER' ? 'Manufacturer' : 'Marketer'} is blacklisted by DTC. ${blHit.remarks || ''}`.trim());
    }

    const isHod = ctx.workflowRoles.has(WORKFLOW_ROLES.HOD) && !ctx.workflowRoles.has(WORKFLOW_ROLES.DOCTOR);
    const staffProfile = await this.scopedStaffProfileRepo.findOneBy({ tenantId: ctx.tenantId, userId: ctx.userId });

    let initialStatus = 'HOD_APPROVED';
    let initialStage: string = STAGES.PHARMACIST_INITIAL_REVIEW;
    let hodId: string | null = null;

    if (!isHod) {
      if (staffProfile?.department) {
        hodId = await this.findHodForDepartment(ctx.tenantId, staffProfile.department);
        if (hodId) {
          initialStatus = 'PENDING_HOD';
          initialStage = STAGES.HOD;
        }
      }
    }

    const entity = this.requestRepo.create({
      tenantId: ctx.tenantId,
      doctorId: ctx.userId,
      createdByUserId: ctx.userId,
      createdByRole: isHod ? 'HOD' : 'Doctor',
      hodId,
      medRepName: isPromotional ? dto.medRepName : (dto.medRepName || null),
      medRepEmail: isPromotional ? dto.medRepEmail : (dto.medRepEmail || null),
      medRepPhone: isPromotional ? dto.medRepPhone : (dto.medRepPhone || null),
      requestType: dto.requestType,
      formularyRequestType: dto.formularyRequestType,
      category: dto.category,
      requestSourceType: sourceType,
      brandName: dto.brandName,
      genericName: dto.genericName,
      doseStrength: dto.doseStrength,
      dosageForm: dto.dosageForm,
      manufacturer: dto.manufacturer,
      marketer: dto.marketer,
      existingBrands: dto.existingBrands || null,
      clinicalJustification: dto.clinicalJustification,
      expectedPatientsPm: dto.expectedPatientsPm,
      costReductionBenefit: !!dto.costReductionBenefit,
      medicineQuantity: dto.medicineQuantity ?? null,
      aiContent: dto.aiContent ? dto.aiContent.replace(/\n/g, '<br>') : null,
      status: initialStatus,
      currentStage: initialStage,
      approvedByHod: isHod,
      hodActionTimestamp: isHod ? new Date() : null,
    });
    const saved = await this.requestRepo.save(entity);

    await this.writeAudit(ctx.tenantId, saved.id, 'SUBMITTED', ctx.userId, null, initialStage,
      `Source: ${sourceType} | Class: ${dto.formularyRequestType}`);

    return { requestId: saved.id };
  }

  async submitPharmacistDirect(ctx: DrugIndentingRequestContext, dto: SubmitPharmacistDrugRequestDto): Promise<{ requestId: string }> {
    const blHit = await this.checkBlacklist(ctx.tenantId, dto.manufacturer, dto.marketer);
    if (blHit) {
      throw new BadRequestException(`Request denied. ${blHit.companyType === 'MANUFACTURER' ? 'Manufacturer' : 'Marketer'} is blacklisted by DTC. ${blHit.remarks || ''}`.trim());
    }

    const entity = this.requestRepo.create({
      tenantId: ctx.tenantId,
      doctorId: dto.doctorId,
      createdByUserId: ctx.userId,
      createdByRole: 'Pharmacist',
      requestType: 'New Molecule',
      category: dto.category,
      requestSourceType: 'PHARMACIST',
      brandName: dto.brandName,
      genericName: dto.genericName,
      doseStrength: dto.doseStrength,
      dosageForm: dto.dosageForm,
      manufacturer: dto.manufacturer,
      marketer: dto.marketer,
      existingBrands: dto.existingBrands || null,
      clinicalJustification: dto.clinicalJustification,
      expectedPatientsPm: 0,
      costReductionBenefit: false,
      medicineQuantity: dto.medicineQuantity ?? null,
      aiContent: dto.aiContent || null,
      status: 'Pending',
      currentStage: STAGES.PHARMACY_HEAD,
    });
    const saved = await this.requestRepo.save(entity);
    await this.writeAudit(ctx.tenantId, saved.id, 'SUBMITTED', ctx.userId, null, STAGES.PHARMACY_HEAD, 'Pharmacist direct request submitted.');
    return { requestId: saved.id };
  }

  async submitEmergency(ctx: DrugIndentingRequestContext, dto: SubmitEmergencyDrugRequestDto): Promise<{ requestId: string }> {
    const sourceType = (dto.requestSourceType || 'NON_PROMOTIONAL').toUpperCase();
    const isPromotional = sourceType === 'PROMOTIONAL';
    if (isPromotional && (!dto.medRepName || !dto.medRepEmail || !dto.medRepPhone)) {
      throw new BadRequestException('Med rep name/email/phone are required for Promotional requests.');
    }

    const blHit = await this.checkBlacklist(ctx.tenantId, dto.manufacturer, dto.marketer);
    if (blHit) {
      throw new BadRequestException(`Request denied. ${blHit.companyType === 'MANUFACTURER' ? 'Manufacturer' : 'Marketer'} is blacklisted by DTC. ${blHit.remarks || ''}`.trim());
    }

    const staffProfile = await this.scopedStaffProfileRepo.findOneBy({ tenantId: ctx.tenantId, userId: ctx.userId });
    const hodId = staffProfile?.department ? await this.findHodForDepartment(ctx.tenantId, staffProfile.department) : null;

    const entity = this.requestRepo.create({
      tenantId: ctx.tenantId,
      doctorId: ctx.userId,
      createdByUserId: ctx.userId,
      createdByRole: ctx.workflowRoles.has(WORKFLOW_ROLES.HOD) ? 'HOD' : 'Doctor',
      hodId,
      medRepName: isPromotional ? dto.medRepName : null,
      medRepEmail: isPromotional ? dto.medRepEmail : null,
      medRepPhone: isPromotional ? dto.medRepPhone : null,
      requestType: dto.requestType,
      category: dto.category,
      requestSourceType: sourceType,
      brandName: dto.brandName,
      genericName: dto.genericName,
      doseStrength: dto.doseStrength,
      dosageForm: dto.dosageForm,
      manufacturer: dto.manufacturer,
      marketer: dto.marketer,
      existingBrands: dto.existingBrands || null,
      clinicalJustification: dto.clinicalJustification,
      aiContent: dto.aiContent || null,
      status: 'EMERGENCY_PENDING_DTC',
      currentStage: STAGES.EMERGENCY_DTC,
      isEmergency: true,
    });
    const saved = await this.requestRepo.save(entity);
    await this.writeAudit(ctx.tenantId, saved.id, 'EMERGENCY_SUBMITTED', ctx.userId, null, STAGES.EMERGENCY_DTC, `Source: ${sourceType}`);
    return { requestId: saved.id };
  }

  // ── Listing ──────────────────────────────────────────────────────────

  /** Ports `GET /:role/:userId` — `role` must be one the caller can act as. */
  async listForRole(ctx: DrugIndentingRequestContext, role: string, filters: {
    status?: string; category?: string; fromDate?: string; toDate?: string;
    sourceType?: string; formularyType?: string;
  }): Promise<DrugRequest[]> {
    const normalizedRole = role.toLowerCase();
    if (!canActAsWorkflowRole(ctx, normalizedRole)) {
      throw new ForbiddenException('You are not authorized to view these requests.');
    }

    const qb = (await this.scopedRequestRepo.createQueryBuilder('dr')).andWhere('1=1');
    const { userId } = ctx;

    if (normalizedRole === WORKFLOW_ROLES.DOCTOR) {
      qb.andWhere('dr.doctorId = :userId', { userId });
    } else if (normalizedRole === WORKFLOW_ROLES.HOD) {
      qb.andWhere(
        '((dr.hodId = :userId AND dr.currentStage = :hodStage AND dr.status = :pendingHod) OR dr.createdByUserId = :userId)',
        { userId, hodStage: STAGES.HOD, pendingHod: 'PENDING_HOD' },
      );
    } else if (normalizedRole === WORKFLOW_ROLES.PHARMACY_HEAD) {
      qb.andWhere(
        "((dr.currentStage IN (:...phStages) AND dr.status IN (:...phStatuses)) OR dr.isEmergency = true)",
        { phStages: [STAGES.PHARMACY_HEAD, STAGES.PHARMACY_HEAD_REVIEW_2], phStatuses: ['Pending', 'HOD_APPROVED', 'REVERTED_BY_DTC'] },
      );
    } else if (normalizedRole === WORKFLOW_ROLES.PHARMACIST) {
      qb.andWhere(
        `(
          (dr.currentStage = :initReview AND dr.status = :hodApproved)
          OR (dr.currentStage = :pharmStage AND dr.status = :pendingStatus)
          OR (dr.currentStage = :correctionStage AND dr.status = :revertedForCorrection)
          OR dr.isEmergency = true
          OR dr.status IN (:...orderStatuses)
          OR dr.createdByUserId = :userId
        )`,
        {
          initReview: STAGES.PHARMACIST_INITIAL_REVIEW, hodApproved: 'HOD_APPROVED',
          pharmStage: STAGES.PHARMACIST, pendingStatus: 'Pending',
          correctionStage: STAGES.PHARMACIST_CORRECTION, revertedForCorrection: 'REVERTED_FOR_CORRECTION',
          orderStatuses: ['APPROVED_PENDING_ORDER', 'ORDER_PLACED', 'INVENTORY_RECEIVED'],
          userId,
        },
      );
    } else if (normalizedRole === WORKFLOW_ROLES.DTC_COMMITTEE) {
      qb.andWhere(
        `(
          (dr.currentStage IN (:...dtcStages) AND dr.status IN (:...dtcStatuses))
          OR (dr.currentStage = :emergencyStage AND dr.status = :emergencyStatus)
        )`,
        {
          dtcStages: [STAGES.DTC_COMMITTEE, STAGES.DTC_FINAL],
          dtcStatuses: ['Pending', 'PHARMACY_HEAD_REJECTED_PENDING_DTC', 'PHARMACIST_REJECTED_PENDING_DTC'],
          emergencyStage: STAGES.EMERGENCY_DTC, emergencyStatus: 'EMERGENCY_PENDING_DTC',
        },
      );
    } else if (normalizedRole === WORKFLOW_ROLES.CEO) {
      qb.andWhere('dr.currentStage = :ceoStage AND dr.status = :pendingStatus', { ceoStage: STAGES.CEO, pendingStatus: 'Pending' });
    } else {
      throw new BadRequestException('Invalid role.');
    }

    if (filters.status) qb.andWhere('dr.status = :fStatus', { fStatus: filters.status });
    if (filters.category) qb.andWhere('LOWER(dr.category) LIKE LOWER(:fCategory)', { fCategory: `%${filters.category}%` });
    if (filters.fromDate) qb.andWhere('dr.createdAt >= :fFrom', { fFrom: filters.fromDate });
    if (filters.toDate) qb.andWhere('dr.createdAt < (:fTo::date + INTERVAL \'1 day\')', { fTo: filters.toDate });
    if (filters.sourceType) qb.andWhere('dr.requestSourceType = :fSourceType', { fSourceType: filters.sourceType });
    if (filters.formularyType) qb.andWhere('dr.formularyRequestType = :fFormularyType', { fFormularyType: filters.formularyType });

    return qb.orderBy('dr.createdAt', 'DESC').getMany();
  }

  private async loadRequestOrThrow(tenantId: string, requestId: string): Promise<DrugRequest> {
    const dr = await this.scopedRequestRepo.findOneBy({ tenantId, id: requestId });
    if (!dr) throw new NotFoundException('Request not found.');
    return dr;
  }

  // ── Approve / reject ────────────────────────────────────────────────

  async approve(ctx: DrugIndentingRequestContext, requestId: string, dto: ApproveDrugRequestDto) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    if (!PENDING_STATUSES.has(dr.status)) throw new BadRequestException('Request is no longer pending.');

    const fromStage = dr.currentStage;
    const approverRole = getApproverRoleForStage(fromStage);
    if (!approverRole || !canActAsWorkflowRole(ctx, approverRole)) {
      throw new ForbiddenException('You are not authorized to approve this request at its current stage.');
    }
    if (fromStage === STAGES.DTC_FINAL) {
      throw new BadRequestException('DTCFinal stage requires drug selection. Use POST /drug-indenting/dtc/final-select/:id instead of /approve.');
    }

    let toStage = NEXT_STAGE[fromStage];
    if (dr.requestSourceType === 'PHARMACIST') {
      if (fromStage === STAGES.DTC_COMMITTEE) toStage = STAGES.CEO;
      else if (fromStage === STAGES.CEO) toStage = STAGES.PHARMACIST_ORDER;
    }

    const isFinal = toStage === STAGES.FINAL;
    const remarksCol = REMARKS_COLUMN_BY_STAGE[fromStage] || 'ceoRemarks';
    let newStatus = dr.isEmergency ? 'EMERGENCY_APPROVED' : (isFinal ? 'Approved' : 'Pending');
    if (fromStage === STAGES.HOD) newStatus = 'HOD_APPROVED';
    if (toStage === STAGES.PHARMACIST_ORDER) newStatus = 'APPROVED_PENDING_ORDER';

    const update: Partial<DrugRequest> = {
      currentStage: toStage,
      status: newStatus,
      [remarksCol]: dto.remarks || null,
      updatedAt: new Date(),
    };
    if (fromStage === STAGES.HOD) {
      update.approvedByHod = true;
      update.hodActionTimestamp = new Date();
    }
    await this.scopedRequestRepo.update({ tenantId: ctx.tenantId, id: requestId }, update);
    await this.writeAudit(ctx.tenantId, requestId, 'APPROVED', ctx.userId, fromStage, toStage, dto.remarks);

    return { message: isFinal ? 'Request finally approved.' : `Request approved and forwarded to next stage.`, newStage: toStage, newStatus };
  }

  async reject(ctx: DrugIndentingRequestContext, requestId: string, dto: RejectDrugRequestDto) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    if (!PENDING_STATUSES.has(dr.status)) throw new BadRequestException('Request is no longer pending.');

    const fromStage = dr.currentStage;
    const approverRole = getApproverRoleForStage(fromStage);
    if (!approverRole || !canActAsWorkflowRole(ctx, approverRole)) {
      throw new ForbiddenException('You are not authorized to reject this request at its current stage.');
    }

    const remarksCol = REMARKS_COLUMN_BY_STAGE[fromStage] || 'ceoRemarks';
    let rejectStatus = dr.isEmergency ? 'EMERGENCY_REJECTED' : 'Rejected';
    let toStage: string = STAGES.REJECTED;

    if (fromStage === STAGES.HOD) {
      rejectStatus = 'HOD_REJECTED';
    } else if (fromStage === STAGES.PHARMACIST_INITIAL_REVIEW) {
      rejectStatus = 'PHARMACIST_REJECTED_PENDING_DTC';
      toStage = STAGES.DTC_COMMITTEE;
    } else if (fromStage === STAGES.PHARMACY_HEAD) {
      rejectStatus = 'PHARMACY_HEAD_REJECTED_PENDING_DTC';
      toStage = STAGES.DTC_COMMITTEE;
    }

    const update: Partial<DrugRequest> = {
      currentStage: toStage,
      status: rejectStatus,
      [remarksCol]: dto.remarks,
      updatedAt: new Date(),
    };
    if (fromStage === STAGES.HOD) update.hodActionTimestamp = new Date();
    await this.scopedRequestRepo.update({ tenantId: ctx.tenantId, id: requestId }, update);
    await this.writeAudit(ctx.tenantId, requestId, 'REJECTED', ctx.userId, fromStage, toStage, dto.remarks);

    return { message: 'Request rejected successfully.' };
  }

  async initialReviewApprove(ctx: DrugIndentingRequestContext, requestId: string, dto: InitialReviewApproveDto) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    if (dr.currentStage !== STAGES.PHARMACIST_INITIAL_REVIEW) {
      throw new BadRequestException('Request is not in PharmacistInitialReview stage.');
    }
    if (!canActAsWorkflowRole(ctx, getApproverRoleForStage(dr.currentStage))) {
      throw new ForbiddenException('You are not authorized to review this request.');
    }
    if (dr.status !== 'HOD_APPROVED' && dr.status !== 'Pending') {
      throw new BadRequestException('Request is not awaiting pharmacist initial review.');
    }

    let effTs: Date | null = null;
    if (dto.effectiveCreatedAt) {
      effTs = new Date(dto.effectiveCreatedAt);
      if (Number.isNaN(effTs.getTime())) throw new BadRequestException('Invalid effectiveCreatedAt datetime value.');
    }

    await this.scopedRequestRepo.update({ tenantId: ctx.tenantId, id: requestId }, {
      currentStage: STAGES.PHARMACY_HEAD,
      status: 'Pending',
      pharmacistRemarks: dto.remarks || null,
      effectiveCreatedAt: effTs ?? dr.createdAt,
      updatedAt: new Date(),
    });
    await this.writeAudit(ctx.tenantId, requestId, 'INITIAL_REVIEW_APPROVED', ctx.userId, STAGES.PHARMACIST_INITIAL_REVIEW, STAGES.PHARMACY_HEAD, dto.remarks);

    return { message: `Request #${requestId} approved by Pharmacist Initial Review and forwarded to Pharmacy Head.`, newStage: STAGES.PHARMACY_HEAD, newStatus: 'Pending' };
  }

  async updateDrugInfo(ctx: DrugIndentingRequestContext, requestId: string, dto: UpdateDrugInfoDto) {
    if (!dto.genericName && !dto.doseStrength && !dto.dosageForm) {
      throw new BadRequestException('At least one of genericName, doseStrength, dosageForm is required.');
    }
    await this.loadRequestOrThrow(ctx.tenantId, requestId);
    const update: Partial<DrugRequest> = { updatedAt: new Date() };
    if (dto.genericName) update.genericName = dto.genericName;
    if (dto.doseStrength) update.doseStrength = dto.doseStrength;
    if (dto.dosageForm) update.dosageForm = dto.dosageForm;
    await this.scopedRequestRepo.update({ tenantId: ctx.tenantId, id: requestId }, update);
    return { message: 'Drug info updated.', ...update };
  }

  async placeOrder(ctx: DrugIndentingRequestContext, requestId: string) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    if (dr.status !== 'EMERGENCY_APPROVED' && dr.status !== 'APPROVED_PENDING_ORDER') {
      throw new BadRequestException('Only approved requests can be ordered.');
    }
    await this.scopedRequestRepo.update({ tenantId: ctx.tenantId, id: requestId }, {
      status: 'ORDER_PLACED', currentStage: STAGES.ORDER_PLACED, updatedAt: new Date(),
    });
    await this.writeAudit(ctx.tenantId, requestId, 'ORDER_PLACED', ctx.userId, STAGES.PHARMACIST_ORDER, STAGES.ORDER_PLACED, 'Drug order placed');
    return { message: 'Order placed successfully.' };
  }

  async markInventoryAdded(ctx: DrugIndentingRequestContext, requestId: string, dto: MarkInventoryAddedDto) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    await this.scopedRequestRepo.update({ tenantId: ctx.tenantId, id: requestId }, {
      inventoryAdded: true,
      inventoryAddedAt: new Date(),
      inventoryAddedBy: ctx.userId,
      inventoryItemName: dto.inventoryItemName || null,
      updatedAt: new Date(),
    });
    await this.writeAudit(ctx.tenantId, requestId, 'INVENTORY_ADDED', ctx.userId, STAGES.PHARMACIST_ORDER, dr.currentStage,
      `Drug added to inventory: ${dto.inventoryItemName || 'unknown'}`);
    return { success: true, message: 'Request marked as inventory-added.' };
  }

  async markInventoryReceived(ctx: DrugIndentingRequestContext, requestId: string) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    if (dr.status !== 'ORDER_PLACED') {
      throw new BadRequestException('Inventory can only be marked as received after the purchase order has been placed.');
    }
    await this.scopedRequestRepo.update({ tenantId: ctx.tenantId, id: requestId }, {
      status: 'INVENTORY_RECEIVED', currentStage: 'Completed', inventoryReceived: true,
      inventoryReceivedAt: new Date(), inventoryReceivedBy: ctx.userId, updatedAt: new Date(),
    });
    await this.writeAudit(ctx.tenantId, requestId, 'INVENTORY_RECEIVED', ctx.userId, dr.currentStage, 'Completed', 'Drug order received and stocked');
    return { success: true, message: 'Request marked as inventory received.' };
  }

  async revertToPharmacist(ctx: DrugIndentingRequestContext, requestId: string, dto: RevertDrugRequestDto) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    if (dr.currentStage !== STAGES.PHARMACY_HEAD_REVIEW_2) {
      throw new BadRequestException('Revert is only allowed during Pharmacy Head Review 2 stage.');
    }
    await this.scopedRequestRepo.update({ tenantId: ctx.tenantId, id: requestId }, {
      currentStage: STAGES.PHARMACIST_CORRECTION,
      status: 'REVERTED_FOR_CORRECTION',
      isReverted: true,
      revertCount: (dr.revertCount || 0) + 1,
      revertRemarks: dto.remarks,
      revertedBy: ctx.userId,
      revertedAt: new Date(),
      updatedAt: new Date(),
    });
    await this.writeAudit(ctx.tenantId, requestId, 'REVERTED_TO_PHARMACIST', ctx.userId, STAGES.PHARMACY_HEAD_REVIEW_2, STAGES.PHARMACIST_CORRECTION, dto.remarks);
    return { message: `Request #${requestId} reverted to Pharmacist for correction.`, newStage: STAGES.PHARMACIST_CORRECTION, newStatus: 'REVERTED_FOR_CORRECTION' };
  }

  /**
   * Atomic for the same reason the source flags: once DTC's structured
   * selection data is cleared, `drug_alternatives.isFinalSelected` flags
   * pointing at it become meaningless too — both must clear together or a
   * reader could see a stale "DTC-selected" alternative next to a request
   * with no selection recorded.
   */
  async revertToPharmacyHead(ctx: DrugIndentingRequestContext, requestId: string, dto: RevertDrugRequestDto) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    if (dr.currentStage !== STAGES.DTC_FINAL) {
      throw new BadRequestException('Revert is only allowed during DTC Final stage.');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(DrugRequest, { tenantId: ctx.tenantId, id: requestId }, {
        currentStage: STAGES.PHARMACY_HEAD_REVIEW_2,
        status: 'REVERTED_BY_DTC',
        isReverted: true,
        revertCount: (dr.revertCount || 0) + 1,
        revertRemarks: dto.remarks,
        revertedBy: ctx.userId,
        revertedAt: new Date(),
        dtcFinalRecommendations: null,
        dtcSelectedBrand: null,
        dtcSelectedCategory: null,
        dtcSelectionReasons: null,
        dtcRecommendationNotes: null,
        finalSelectedAlternativeId: null,
        dtcFinalSelectionNotes: null,
        finalSelectedBrand: null,
        finalSelectedCategory: null,
        finalSelectionReasons: null,
        finalRecommendationNotes: null,
        updatedAt: new Date(),
      });
      await manager.update(DrugAlternative, { tenantId: ctx.tenantId, requestId }, { isFinalSelected: false });
    });

    await this.writeAudit(ctx.tenantId, requestId, 'REVERTED_TO_PHARMACY_HEAD', ctx.userId, STAGES.DTC_FINAL, STAGES.PHARMACY_HEAD_REVIEW_2, dto.remarks);
    return { message: `Request #${requestId} reverted to Pharmacy Head for further review.`, newStage: STAGES.PHARMACY_HEAD_REVIEW_2, newStatus: 'REVERTED_BY_DTC' };
  }

  /**
   * Atomic: replacing the comparison sheet (delete+reinsert) and restoring
   * matched prior negotiations must happen together — a failure between
   * the two would either lose Pharmacy Head's negotiated rates permanently
   * (matches source's exact bug-fix rationale) or leave the sheet deleted
   * with no replacement rows.
   */
  async resubmitCorrection(ctx: DrugIndentingRequestContext, requestId: string, dto: ResubmitCorrectionDto) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    if (dr.currentStage !== STAGES.PHARMACIST_CORRECTION) {
      throw new BadRequestException('Resubmit is only allowed from Pharmacist Correction stage.');
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.alternatives && dto.alternatives.length > 0) {
        const matchKey = (brand?: string, mfr?: string) => `${String(brand || '').trim().toLowerCase()}|${String(mfr || '').trim().toLowerCase()}`;

        const priorNegRows: Array<{ brandName: string; manufacturer: string } & Partial<DrugAlternativeNegotiation>> =
          await manager.query(
            `SELECT da.brand_name AS "brandName", da.manufacturer,
                    dn.negotiated_mrp AS "negotiatedMrp", dn.negotiated_rate AS "negotiatedRate",
                    dn.negotiated_gst AS "negotiatedGst", dn.negotiated_scheme_qty AS "negotiatedSchemeQty",
                    dn.negotiated_scheme_offer AS "negotiatedSchemeOffer", dn.negotiated_net_rate AS "negotiatedNetRate",
                    dn.negotiated_profit_margin AS "negotiatedProfitMargin", dn.negotiated_absolute_margin AS "negotiatedAbsoluteMargin",
                    dn.negotiated_total_margin AS "negotiatedTotalMargin", dn.negotiated_by AS "negotiatedBy",
                    dn.negotiated_at AS "negotiatedAt", dn.negotiation_remarks AS "negotiationRemarks"
               FROM drug_alternatives da
               JOIN drug_alternative_negotiations dn ON dn.alternative_id = da.id
              WHERE da.request_id = $1 AND da.tenant_id = $2`,
            [requestId, ctx.tenantId],
          );
        const priorNegByKey = new Map(priorNegRows.map((r) => [matchKey(r.brandName, r.manufacturer), r]));

        await manager.delete(DrugAlternative, { tenantId: ctx.tenantId, requestId });

        const newAlts: DrugAlternative[] = [];
        for (const alt of dto.alternatives) {
          const d = computeAltDerived(alt);
          const created = manager.create(DrugAlternative, {
            tenantId: ctx.tenantId,
            requestId,
            brandName: alt.brandName || '',
            manufacturer: alt.manufacturer || '',
            marketer: alt.marketer || null,
            mrpPerPack: alt.mrpPerPack != null ? String(alt.mrpPerPack) : null,
            ratePerPack: alt.ratePerPack != null ? String(alt.ratePerPack) : null,
            gstPercent: alt.gstPercent != null ? String(alt.gstPercent) : null,
            mrp: d.mrp != null ? String(d.mrp) : null,
            rate: d.rate != null ? String(d.rate) : null,
            qty: alt.qty != null ? String(alt.qty) : null,
            offer: alt.offer != null ? String(alt.offer) : null,
            markupMargin: d.markup_margin != null ? String(d.markup_margin) : null,
            netRate: d.net_rate != null ? String(d.net_rate) : null,
            absoluteMargin: d.absolute_margin != null ? String(d.absolute_margin) : null,
            negotiatedRate: alt.negorate != null ? String(alt.negorate) : null,
            profitMargin: d.profit_margin != null ? String(d.profit_margin) : null,
            stock: alt.stock || null,
            purchaseQuantity: alt.purchaseQty != null ? Number(alt.purchaseQty) : null,
            consultant: alt.consultant || null,
            saleQty: alt.saleQty != null ? Number(alt.saleQty) : null,
            pack: alt.pack != null ? String(alt.pack) : null,
            introducedOn: alt.introducedOn || 'New Item',
            comparisonType: dto.comparisonType || 'new_generic',
            remark: alt.remark || null,
            submittedBy: ctx.userId,
          });
          newAlts.push(created);
        }
        const savedAlts = await manager.save(DrugAlternative, newAlts);

        const negToInsert: DrugAlternativeNegotiation[] = [];
        savedAlts.forEach((savedAlt, i) => {
          const alt = dto.alternatives![i];
          const prior = priorNegByKey.get(matchKey(alt.brandName, alt.manufacturer));
          if (prior) {
            negToInsert.push(manager.create(DrugAlternativeNegotiation, {
              tenantId: ctx.tenantId,
              alternativeId: savedAlt.id,
              negotiatedMrp: prior.negotiatedMrp ?? null,
              negotiatedRate: prior.negotiatedRate ?? null,
              negotiatedGst: prior.negotiatedGst ?? null,
              negotiatedSchemeQty: prior.negotiatedSchemeQty ?? null,
              negotiatedSchemeOffer: prior.negotiatedSchemeOffer ?? null,
              negotiatedNetRate: prior.negotiatedNetRate ?? null,
              negotiatedProfitMargin: prior.negotiatedProfitMargin ?? null,
              negotiatedAbsoluteMargin: prior.negotiatedAbsoluteMargin ?? null,
              negotiatedTotalMargin: prior.negotiatedTotalMargin ?? null,
              negotiatedBy: prior.negotiatedBy ?? null,
              negotiatedAt: prior.negotiatedAt ?? null,
              negotiationRemarks: prior.negotiationRemarks ?? null,
            }));
          }
        });
        if (negToInsert.length > 0) await manager.save(DrugAlternativeNegotiation, negToInsert);
      }

      await manager.update(DrugRequest, { tenantId: ctx.tenantId, id: requestId }, {
        currentStage: STAGES.PHARMACY_HEAD_REVIEW_2,
        status: 'Pending',
        isReverted: false,
        revertRemarks: null,
        pharmacistRemarks: dto.remarks || dr.pharmacistRemarks,
        existingGenericData: dto.existingGenericData ? JSON.stringify(dto.existingGenericData) : dr.existingGenericData,
        lastCorrectedAt: new Date(),
        lastCorrectedBy: ctx.userId,
        updatedAt: new Date(),
      });
    });

    await this.writeAudit(ctx.tenantId, requestId, 'CORRECTION_RESUBMITTED', ctx.userId, STAGES.PHARMACIST_CORRECTION, STAGES.PHARMACY_HEAD_REVIEW_2,
      dto.remarks || `Corrected comparison sheet resubmitted (revert #${dr.revertCount || 1})`);

    return { message: `Corrected comparison sheet for Request #${requestId} resubmitted to Pharmacy Head.`, newStage: STAGES.PHARMACY_HEAD_REVIEW_2, newStatus: 'Pending' };
  }

  /**
   * Ports `alternatives.js`'s `POST /alternatives/:requestId` — the real
   * "Pharmacist submits comparison sheet" transition for the normal
   * (non-reverted) path. Not part of `requests.js`: `STAGE_APPROVER_ROLE`
   * has no entry for the plain `'Pharmacist'` stage (verified — the
   * generic `/approve` endpoint genuinely cannot advance a request sitting
   * there, in the source too), so this dedicated endpoint is the only way
   * a request ever leaves the `Pharmacist` stage on the first pass.
   *
   * Source has no `current_stage` guard here (unconditionally moves the
   * request to `PharmacyHeadReview2` regardless of prior stage) — that
   * looseness is preserved as-is rather than inventing a stricter check
   * the original never had.
   */
  async submitAlternatives(ctx: DrugIndentingRequestContext, requestId: string, dto: ResubmitCorrectionDto) {
    const dr = await this.loadRequestOrThrow(ctx.tenantId, requestId);
    if (!dto.alternatives || dto.alternatives.length < 1) {
      throw new BadRequestException('At least one alternative is required.');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(DrugAlternative, { tenantId: ctx.tenantId, requestId });

      const newAlts = dto.alternatives!.map((alt) => {
        const d = computeAltDerived(alt);
        return manager.create(DrugAlternative, {
          tenantId: ctx.tenantId,
          requestId,
          brandName: alt.brandName || '',
          manufacturer: alt.manufacturer || '',
          marketer: alt.marketer || null,
          mrpPerPack: alt.mrpPerPack != null ? String(alt.mrpPerPack) : null,
          ratePerPack: alt.ratePerPack != null ? String(alt.ratePerPack) : null,
          gstPercent: alt.gstPercent != null ? String(alt.gstPercent) : null,
          mrp: d.mrp != null ? String(d.mrp) : null,
          rate: d.rate != null ? String(d.rate) : null,
          qty: alt.qty != null ? String(alt.qty) : null,
          offer: alt.offer != null ? String(alt.offer) : null,
          markupMargin: d.markup_margin != null ? String(d.markup_margin) : null,
          netRate: d.net_rate != null ? String(d.net_rate) : null,
          absoluteMargin: d.absolute_margin != null ? String(d.absolute_margin) : null,
          negotiatedRate: alt.negorate != null ? String(alt.negorate) : null,
          profitMargin: d.profit_margin != null ? String(d.profit_margin) : null,
          stock: alt.stock || null,
          purchaseQuantity: alt.purchaseQty != null ? Number(alt.purchaseQty) : null,
          consultant: alt.consultant || null,
          saleQty: alt.saleQty != null ? Number(alt.saleQty) : null,
          pack: alt.pack != null ? String(alt.pack) : null,
          introducedOn: alt.introducedOn || 'New Item',
          comparisonType: dto.comparisonType || 'new_generic',
          remark: alt.remark || null,
          submittedBy: ctx.userId,
        });
      });
      await manager.save(DrugAlternative, newAlts);

      await manager.update(DrugRequest, { tenantId: ctx.tenantId, id: requestId }, {
        currentStage: STAGES.PHARMACY_HEAD_REVIEW_2,
        existingGenericData: dto.existingGenericData ? JSON.stringify(dto.existingGenericData) : dr.existingGenericData,
        pharmacistRemarks: dto.remarks || dr.pharmacistRemarks,
        updatedAt: new Date(),
      });
    });

    await this.writeAudit(ctx.tenantId, requestId, 'ALTERNATIVES_SUBMITTED', ctx.userId, STAGES.PHARMACIST, STAGES.PHARMACY_HEAD_REVIEW_2, dto.remarks);

    return { message: 'Alternatives submitted. Forwarded to Pharmacy Head.' };
  }
}
