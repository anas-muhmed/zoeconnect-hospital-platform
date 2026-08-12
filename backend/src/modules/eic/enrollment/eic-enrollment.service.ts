import {
  Inject, Injectable, Logger, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EicTherapyEnrollment } from '../entities/eic-therapy-enrollment.entity';
import { EicTherapyTeamMember } from '../entities/eic-therapy-team-member.entity';
import { EicPatientService } from '../patient/eic-patient.service';
import { AuditService } from '../../audit/audit.service';
import { EicEnrollmentStatus } from '../common/enums/enrollment-status.enum';
import type { CreateEicEnrollmentDto, AssignTherapistDto } from './dto/create-enrollment.dto';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class EicEnrollmentService {
  private readonly logger = new Logger(EicEnrollmentService.name);

  constructor(
    @InjectRepository(EicTherapyEnrollment)
    private readonly enrollmentRepo: Repository<EicTherapyEnrollment>,

    @InjectRepository(EicTherapyTeamMember)
    private readonly teamRepo: Repository<EicTherapyTeamMember>,

    private readonly patientService: EicPatientService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,

    /**
     * Stage B (Checkpoint B3.5) — scoped repositories for `findById()`,
     * `findByPatient()`, `getTeam()` only. `create()`, `assignTherapist()`,
     * `removeTherapist()`, and `generateEnrollmentNumber()` stay on
     * `enrollmentRepo`/`teamRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(EicTherapyEnrollment))
    private readonly scopedEnrollmentRepo: TenantScopedRepository<EicTherapyEnrollment>,
    @Inject(getTenantScopedRepositoryToken(EicTherapyTeamMember))
    private readonly scopedTeamRepo: TenantScopedRepository<EicTherapyTeamMember>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(
    dto: CreateEicEnrollmentDto,
    actorId: string,
    branchId?: string | null,
  ): Promise<EicTherapyEnrollment> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    return this.dataSource.transaction(async (manager) => {
      // Ensure EIC patient record exists (create from HIS if needed)
      const patient = await this.patientService.createFromHis(dto.mrn, actorId, branchId);

      const enrollmentNumber = await this.generateEnrollmentNumber();

      const enrollment = manager.create(EicTherapyEnrollment, {
        patientId:         patient.id,
        enrollmentNumber,
        admissionDate:     dto.admissionDate,
        activeDisciplines: dto.activeDisciplines,
        primaryDiagnosis:  dto.primaryDiagnosis ?? null,
        referralSource:    dto.referralSource ?? null,
        notes:             dto.notes ?? null,
        status:            EicEnrollmentStatus.ACTIVE,
        createdBy:         actorId,
        updatedBy:         actorId,
        tenantId,
      });

      const saved = await manager.save(EicTherapyEnrollment, enrollment);

      await this.auditService.log({
        module:     'EIC',
        action:     'EIC_ENROLLMENT_CREATED',
        entityType: 'eic_therapy_enrollments',
        entityId:   saved.id,
        userId: actorId,
        metadata:   { mrn: dto.mrn, enrollmentNumber },
      });

      return saved;
    });
  }

  async findById(id: string): Promise<EicTherapyEnrollment> {
    const enrollment = await this.scopedEnrollmentRepo.findOne({
      where: { id },
      relations: ['patient', 'teamMembers'],
    });
    if (!enrollment) throw new NotFoundException(`Enrollment ${id} not found`);
    // A5.5 API Contract Audit: backs GET /eic/enrollments/:id -- eager
    // `patient`/`teamMembers` relations make an explicit .select() column
    // list impractical, so strip tenantId post-fetch instead.
    delete (enrollment as { tenantId?: string | null }).tenantId;
    if (enrollment.patient) delete (enrollment.patient as { tenantId?: string | null }).tenantId;
    for (const m of enrollment.teamMembers ?? []) delete (m as { tenantId?: string | null }).tenantId;
    return enrollment;
  }

  async findByPatient(patientId: string): Promise<EicTherapyEnrollment[]> {
    const enrollments = await this.scopedEnrollmentRepo.find({
      where: { patientId },
      relations: ['teamMembers'],
      order: { createdAt: 'DESC' },
    });
    // A5.5 API Contract Audit: backs GET /eic/patients/:id/enrollments --
    // eager `teamMembers` relation makes an explicit .select() column list
    // impractical, so strip tenantId post-fetch instead.
    for (const e of enrollments) {
      delete (e as { tenantId?: string | null }).tenantId;
      for (const m of e.teamMembers ?? []) delete (m as { tenantId?: string | null }).tenantId;
    }
    return enrollments;
  }

  async assignTherapist(
    enrollmentId: string,
    dto: AssignTherapistDto,
    actorId: string,
  ): Promise<EicTherapyTeamMember> {
    const enrollment = await this.findById(enrollmentId);

    // Check for duplicate active assignment
    const existing = await this.teamRepo.findOne({
      where: { enrollmentId, therapistId: dto.therapistId, discipline: dto.discipline, isActive: true },
    });
    if (existing) {
      throw new ConflictException(`Therapist already assigned to ${dto.discipline} for this enrollment`);
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const member = this.teamRepo.create({
      enrollmentId,
      therapistId:   dto.therapistId,
      therapistName: dto.therapistName,
      discipline:    dto.discipline,
      isActive:      true,
      tenantId,
    });

    const saved = await this.teamRepo.save(member);

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_THERAPIST_ASSIGNED',
      entityType: 'eic_therapy_team_members',
      entityId:   saved.id,
      userId: actorId,
      metadata:   { enrollmentId, discipline: dto.discipline, therapistId: dto.therapistId },
    });

    return saved;
  }

  async removeTherapist(enrollmentId: string, memberId: string, actorId: string): Promise<void> {
    const member = await this.teamRepo.findOne({ where: { id: memberId, enrollmentId } });
    if (!member) throw new NotFoundException(`Team member ${memberId} not found`);

    await this.teamRepo.update(memberId, { isActive: false, removedAt: new Date() });
  }

  // A5.5 API Contract Audit: explicit column list excludes tenant_id so
  // GET /eic/enrollments/:id/team doesn't leak it.
  async getTeam(enrollmentId: string): Promise<EicTherapyTeamMember[]> {
    return this.scopedTeamRepo.find({
      where: { enrollmentId, isActive: true },
      order: { discipline: 'ASC' },
      select: [
        'id', 'enrollmentId', 'therapistId', 'therapistName', 'discipline',
        'assignedAt', 'removedAt', 'isActive',
      ],
    });
  }

  private async generateEnrollmentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.enrollmentRepo.count();
    const seq   = String(count + 1).padStart(5, '0');
    return `EIC-${year}-${seq}`;
  }
}
