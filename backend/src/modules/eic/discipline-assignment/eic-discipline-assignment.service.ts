import {
  Inject, Injectable, Logger, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  EicEnrollmentDisciplineAssignment,
  AssignmentRole,
} from '../entities/eic-enrollment-discipline-assignment.entity';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { CreateDisciplineAssignmentDto } from './dto/create-discipline-assignment.dto';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class EicDisciplineAssignmentService {
  private readonly logger = new Logger(EicDisciplineAssignmentService.name);

  constructor(
    @InjectRepository(EicEnrollmentDisciplineAssignment)
    private readonly assignmentRepo: Repository<EicEnrollmentDisciplineAssignment>,

    /**
     * Stage B (Checkpoint B3.5) — scoped repository for `findByEnrollment()`/
     * `findActiveByEnrollment()`/`findActivePrimary()` only. `create()`/
     * `close()` stay on `assignmentRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(EicEnrollmentDisciplineAssignment))
    private readonly scopedAssignmentRepo: TenantScopedRepository<EicEnrollmentDisciplineAssignment>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  /**
   * Create a new discipline assignment for an enrollment.
   * Automatically closes any existing active assignment for the same
   * enrollment + discipline + role combination before creating the new one.
   */
  async create(
    enrollmentId: string,
    dto: CreateDisciplineAssignmentDto,
    actorId: string,
  ): Promise<EicEnrollmentDisciplineAssignment> {
    // Find the current active assignment for this slot (if any)
    const existing = await this.assignmentRepo.findOne({
      where: {
        enrollmentId,
        discipline: dto.discipline,
        role:       dto.role,
        isActive:   true,
      },
    });

    let nextVersion = 1;

    if (existing) {
      if (existing.therapistId === dto.therapistId) {
        throw new ConflictException(
          `Therapist is already the active ${dto.role} for ${dto.discipline} on this enrollment.`,
        );
      }
      // Close the existing assignment
      await this.assignmentRepo.update(existing.id, {
        isActive:    false,
        effectiveTo: dto.effectiveFrom,
      });
      nextVersion = existing.version + 1;
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const assignment = this.assignmentRepo.create({
      enrollmentId,
      discipline:       dto.discipline,
      therapistId:      dto.therapistId,
      role:             dto.role,
      assignmentReason: dto.assignmentReason ?? null,
      effectiveFrom:    dto.effectiveFrom,
      effectiveTo:      null,
      isActive:         true,
      assignedBy:       actorId,
      version:          nextVersion,
      tenantId,
    });

    const saved = await this.assignmentRepo.save(assignment);
    this.logger.log(
      `Assignment created: enrollment=${enrollmentId} discipline=${dto.discipline} ` +
      `role=${dto.role} therapist=${dto.therapistId} v${nextVersion}`,
    );
    return saved;
  }

  /**
   * Return full assignment history for an enrollment (active + closed), newest first.
   */
  // A5.5 API Contract Audit: explicit column list excludes tenant_id so
  // these two GET-backing methods don't leak it.
  private static readonly SELECT_NO_TENANT: (keyof EicEnrollmentDisciplineAssignment)[] = [
    'id', 'enrollmentId', 'discipline', 'therapistId', 'role', 'assignmentReason',
    'effectiveFrom', 'effectiveTo', 'isActive', 'assignedBy', 'version',
    'createdAt', 'updatedAt',
  ];

  async findByEnrollment(enrollmentId: string): Promise<EicEnrollmentDisciplineAssignment[]> {
    return this.scopedAssignmentRepo.find({
      where: { enrollmentId },
      order: { discipline: 'ASC', version: 'DESC' },
      select: EicDisciplineAssignmentService.SELECT_NO_TENANT,
    });
  }

  /**
   * Return only currently active assignments for an enrollment.
   */
  async findActiveByEnrollment(enrollmentId: string): Promise<EicEnrollmentDisciplineAssignment[]> {
    return this.scopedAssignmentRepo.find({
      where: { enrollmentId, isActive: true },
      order: { discipline: 'ASC', role: 'ASC' },
      select: EicDisciplineAssignmentService.SELECT_NO_TENANT,
    });
  }

  /**
   * Return the active PRIMARY assignment for a specific discipline on an enrollment.
   * Returns null if none exists (section will be left as "unassigned").
   */
  async findActivePrimary(
    enrollmentId: string,
    discipline:   EicDiscipline,
  ): Promise<EicEnrollmentDisciplineAssignment | null> {
    return this.scopedAssignmentRepo.findOne({
      where: {
        enrollmentId,
        discipline,
        role:     AssignmentRole.PRIMARY,
        isActive: true,
      },
    });
  }

  /**
   * Batched counterpart to `findActivePrimary()` — one active PRIMARY
   * assignment per discipline, for every discipline in `disciplines`, in a
   * single query instead of one round trip per discipline. Returned as a
   * Map keyed by discipline; disciplines with no active PRIMARY assignment
   * are simply absent from the map (same "no result" case `findActivePrimary`
   * represents as `null`).
   */
  async findActivePrimaryBatch(
    enrollmentId: string,
    disciplines:  EicDiscipline[],
  ): Promise<Map<EicDiscipline, EicEnrollmentDisciplineAssignment>> {
    const result = new Map<EicDiscipline, EicEnrollmentDisciplineAssignment>();
    if (disciplines.length === 0) return result;

    const uniqueDisciplines = [...new Set(disciplines)];
    const assignments = await this.scopedAssignmentRepo.find({
      where: {
        enrollmentId,
        discipline: In(uniqueDisciplines),
        role:       AssignmentRole.PRIMARY,
        isActive:   true,
      },
    });
    for (const a of assignments) result.set(a.discipline, a);
    return result;
  }

  /**
   * Close (deactivate) an assignment by setting effective_to and is_active = false.
   */
  async close(
    enrollmentId:  string,
    assignmentId:  string,
    effectiveTo:   string,
  ): Promise<EicEnrollmentDisciplineAssignment> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId, enrollmentId },
    });
    if (!assignment) {
      throw new NotFoundException(`Assignment ${assignmentId} not found for enrollment ${enrollmentId}`);
    }

    await this.assignmentRepo.update(assignmentId, {
      isActive:   false,
      effectiveTo,
    });

    return this.assignmentRepo.findOneOrFail({ where: { id: assignmentId } });
  }
}
