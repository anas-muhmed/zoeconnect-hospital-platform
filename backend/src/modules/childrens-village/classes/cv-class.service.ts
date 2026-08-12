import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { CvClass } from './entities/cv-class.entity';
import { CvTimetablePeriod } from '../timetables/entities/cv-timetable-period.entity';
import { CvStudentAllocation } from '../students/entities/cv-student-allocation.entity';
import { CvStudent } from '../students/entities/cv-student.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

// Converted from `interface` to `class` + class-validator decorators
// (2026-08-03) -- see cv-admissions.service.ts's CreateAdmissionDto doc
// comment for why this matters under the app's global
// `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`: an
// `interface`-typed @Body() erases to `Object` at runtime and silently
// skips validation entirely (not broken, but zero input checking/coercion).
// These weren't causing 400s, but had no real validation either.
export class CreateClassDto {
  @IsString()
  academicYearId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsString()
  ageGroup?: string;

  @IsOptional()
  @IsString()
  disabilityCategory?: string;

  @IsOptional()
  @IsString()
  roomNumber?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// Roster write path (2026-08-03) -- `cv_student_allocations` and the
// CV:ALLOCATION:CREATE/UPDATE/READ permissions were created back in Phase 3
// (1789400000000-CreateCVStudentsPhase3.ts) but nothing ever wrote to the
// table: no controller route, no service method. A student could be
// admitted but never actually placed in a class. This DTO backs the new
// assignStudent() write path below.
export class AssignStudentToClassDto {
  @IsString()
  studentId: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsString()
  ageGroup?: string;

  @IsOptional()
  @IsString()
  disabilityCategory?: string;

  @IsOptional()
  @IsString()
  roomNumber?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class CvClassService {
  private readonly logger = new Logger(CvClassService.name);

  constructor(
    @InjectRepository(CvClass)
    private readonly writeRepo: Repository<CvClass>,
    
    @Inject(getTenantScopedRepositoryToken(CvClass))
    private readonly readRepo: TenantScopedRepository<CvClass>,

    @InjectRepository(CvTimetablePeriod)
    private readonly periodRepo: Repository<CvTimetablePeriod>,

    @InjectRepository(CvStudentAllocation)
    private readonly allocationRepo: Repository<CvStudentAllocation>,

    @InjectRepository(CvStudent)
    private readonly studentRepo: Repository<CvStudent>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async findAll(academicYearId?: string): Promise<CvClass[]> {
    const whereClause: any = {};
    if (academicYearId) {
      whereClause.academicYearId = academicYearId;
    }
    return this.readRepo.find({
      where: whereClause,
      order: { name: 'ASC' },
      relations: ['academicYear'],
    });
  }

  async findById(id: string): Promise<CvClass> {
    const classEntity = await this.readRepo.findOne({
      where: { id },
      relations: ['academicYear'],
    });
    if (!classEntity) {
      throw new NotFoundException(`Class ${id} not found`);
    }
    return classEntity;
  }

  async create(data: CreateClassDto, actorId: string): Promise<CvClass> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const hospitalId = await this.tenantContext.currentTenantIdOrNull();

    const classEntity = this.writeRepo.create({
      ...data,
      isActive: data.isActive ?? true,
      createdBy: actorId,
      tenantId,
      hospitalId,
    });

    const saved = await this.writeRepo.save(classEntity);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_CLASS_CREATED',
      entityType: 'cv_classes',
      entityId: saved.id,
      userId: actorId,
      metadata: { name: saved.name },
    });

    return saved;
  }

  async update(id: string, data: UpdateClassDto, actorId: string): Promise<CvClass> {
    await this.findById(id);

    await this.writeRepo.update(id, {
      ...data,
      updatedBy: actorId,
      updatedAt: new Date(),
    });

    const updated = await this.findById(id);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_CLASS_UPDATED',
      entityType: 'cv_classes',
      entityId: id,
      userId: actorId,
      metadata: { updates: data },
    });

    return updated;
  }

  /**
   * Real student roster for a teacher's own classes -- built to replace the
   * Teacher Workspace page's hardcoded "Leo M." / "Mia T." dropdown options
   * (2026-08-03 fix). No single field reliably says "this teacher's
   * classes" on its own, so this unions two signals:
   *  - `CvClass.classTeacherId` (the column exists for exactly this, but
   *    grep shows nothing in the app ever sets it, so it's empty in
   *    practice for most tenants);
   *  - distinct classes the teacher actually has periods in on
   *    `cv_timetable_periods` (the signal the timetable widget already
   *    relies on, and the one that's actually populated).
   * Once we have class ids, the roster is every ACTIVE allocation for
   * those classes, joined to the student.
   */
  async getRosterForTeacher(teacherId: string): Promise<Array<{
    id: string; firstName: string; lastName: string; classId: string; className: string;
  }>> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const ownedClasses = await this.readRepo.find({ where: { classTeacherId: teacherId, isActive: true } });
    const ownedClassIds = ownedClasses.map((c) => c.id);

    const periodClassRows = await this.periodRepo
      .createQueryBuilder('p')
      .innerJoin('p.timetable', 't')
      .select('DISTINCT t.classId', 'classId')
      .where('p.teacherId = :teacherId', { teacherId })
      .andWhere(tenantId ? 'p.tenantId = :tenantId' : '1=1', { tenantId })
      .getRawMany();
    const periodClassIds = periodClassRows.map((r) => r.classId).filter(Boolean);

    const classIds = Array.from(new Set([...ownedClassIds, ...periodClassIds]));
    if (classIds.length === 0) return [];

    const allocations = await this.allocationRepo.find({
      where: {
        classId: In(classIds),
        status: 'ACTIVE',
        ...(tenantId ? { tenantId } : {}),
      },
      relations: ['student', 'cvClass'],
    });

    return allocations
      .filter((a) => a.student)
      .map((a) => ({
        id: a.student.id,
        firstName: a.student.firstName,
        lastName: a.student.lastName,
        classId: a.classId,
        className: a.cvClass?.name ?? '',
      }))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }

  /** The roster shown on the class detail page -- every ACTIVE allocation for this class. */
  async getRoster(classId: string): Promise<Array<{
    allocationId: string;
    studentId: string;
    firstName: string;
    lastName: string;
    registrationNumber: string | null;
    admissionStatus: string | null;
    startDate: Date;
    status: string;
  }>> {
    await this.findById(classId); // 404s if the class doesn't exist (or isn't in this tenant)

    const allocations = await this.allocationRepo.find({
      where: { classId, status: 'ACTIVE' },
      relations: ['student'],
      order: { createdAt: 'DESC' },
    });

    return allocations
      .filter((a) => a.student)
      .map((a) => ({
        allocationId: a.id,
        studentId: a.student.id,
        firstName: a.student.firstName,
        lastName: a.student.lastName,
        registrationNumber: a.student.registrationNumber ?? null,
        admissionStatus: a.student.admissionStatus ?? null,
        startDate: a.startDate,
        status: a.status,
      }));
  }

  /**
   * Places a student into this class. If the student already has an ACTIVE
   * allocation elsewhere, that allocation is closed out (status
   * TRANSFERRED) rather than left dangling alongside the new one, so a
   * student is never active in two classes at once.
   */
  async assignStudent(classId: string, dto: AssignStudentToClassDto, actorId: string): Promise<CvStudentAllocation> {
    const classEntity = await this.findById(classId);

    const student = await this.studentRepo.findOne({ where: { id: dto.studentId } });
    if (!student) {
      throw new NotFoundException(`Student ${dto.studentId} not found`);
    }

    const existingActive = await this.allocationRepo.findOne({
      where: { studentId: dto.studentId, status: 'ACTIVE' },
    });
    if (existingActive) {
      if (existingActive.classId === classId) {
        throw new BadRequestException('This student is already enrolled in this class.');
      }
      await this.allocationRepo.update(existingActive.id, {
        status: 'TRANSFERRED',
        endDate: new Date(),
        updatedBy: actorId,
      });
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const allocation = this.allocationRepo.create({
      studentId: dto.studentId,
      classId,
      academicYearId: dto.academicYearId ?? classEntity.academicYearId,
      startDate: new Date(),
      status: 'ACTIVE',
      tenantId: tenantId as string,
      createdBy: actorId,
    });
    const saved = await this.allocationRepo.save(allocation);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_STUDENT_ASSIGNED_TO_CLASS',
      entityType: 'cv_student_allocations',
      entityId: saved.id,
      userId: actorId,
      metadata: { studentId: dto.studentId, classId, previousAllocationId: existingActive?.id ?? null },
    });

    return saved;
  }

  /** Ends a student's active enrollment in this class (does not delete history). */
  async removeStudent(classId: string, studentId: string, actorId: string): Promise<void> {
    const allocation = await this.allocationRepo.findOne({
      where: { classId, studentId, status: 'ACTIVE' },
    });
    if (!allocation) {
      throw new NotFoundException('This student does not have an active enrollment in this class.');
    }

    await this.allocationRepo.update(allocation.id, {
      status: 'ARCHIVED',
      endDate: new Date(),
      updatedBy: actorId,
    });

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_STUDENT_REMOVED_FROM_CLASS',
      entityType: 'cv_student_allocations',
      entityId: allocation.id,
      userId: actorId,
      metadata: { studentId, classId },
    });
  }
}
