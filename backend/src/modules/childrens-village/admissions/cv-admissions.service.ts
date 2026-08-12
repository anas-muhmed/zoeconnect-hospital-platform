import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  IsString, IsOptional, IsBoolean, IsDateString, IsArray, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { CVStudentProvider, UnifiedStudent } from '../students/interfaces/cv-student.interface';
import { CvGuardian } from '../students/entities/cv-guardian.entity';
import { CvStudentGuardianLink } from '../students/entities/cv-student-guardian-link.entity';
import { CvStudentMedicalProfile } from '../students/entities/cv-student-medical-profile.entity';
import { CvStudent } from '../students/entities/cv-student.entity';
import { CvSettingsService } from '../settings/cv-settings.service';

/**
 * Bug fix (2026-08-03, real incident): these DTOs are `class`es (not plain
 * `interface`s, like every sibling module's Create/Update DTOs -- e.g.
 * `cv-class.service.ts`'s `CreateClassDto`). That distinction matters a lot
 * under the app's global `ValidationPipe({ whitelist: true,
 * forbidNonWhitelisted: true })` (see backend/src/main.ts): a parameter
 * typed with a TS `interface` erases to `Object` at runtime (interfaces
 * don't exist post-compilation), which NestJS's ValidationPipe treats as a
 * "native" type and skips validation for entirely -- so those sibling DTOs
 * silently bypass whitelist/forbidNonWhitelisted. A parameter typed with an
 * actual `class`, like these two, DOES get validated -- and a class with
 * zero class-validator decorators has no "known" properties for whitelist
 * to keep, so every property on the incoming body gets stripped/rejected as
 * unrecognized ("property firstName should not exist", etc. for all
 * fields). That's exactly what broke every admission submission. Adding the
 * decorators below both fixes the 400 and gives this endpoint real input
 * validation, which the interface-typed siblings don't have at all --
 * worth doing the same conversion there later, but out of scope for this
 * fix since those aren't currently broken.
 */
export class CreateGuardianDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  relationship: string;

  @IsOptional()
  @IsBoolean()
  isPrimaryGuardian?: boolean;

  @IsOptional()
  @IsBoolean()
  isEmergencyContact?: boolean;
}

export class CreateAdmissionDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  // Sent as a plain "YYYY-MM-DD" string from the frontend's <input
  // type="date"> -- never a real Date instance over JSON, so this is typed
  // (and validated) as a date string, not `Date`.
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGuardianDto)
  guardians: CreateGuardianDto[];

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  disabilityType?: string;
}

@Injectable()
export class CvAdmissionsService {
  constructor(
    @Inject(CVStudentProvider)
    private readonly studentProvider: CVStudentProvider,
    @InjectRepository(CvGuardian)
    private readonly guardianRepo: Repository<CvGuardian>,
    @InjectRepository(CvStudentGuardianLink)
    private readonly linkRepo: Repository<CvStudentGuardianLink>,
    @InjectRepository(CvStudentMedicalProfile)
    private readonly medicalRepo: Repository<CvStudentMedicalProfile>,
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly settingsService: CvSettingsService,
  ) {}

  async createAdmission(dto: CreateAdmissionDto, actorId: string): Promise<UnifiedStudent> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required for admissions');
    }

    // Admin/superadmin-configurable (CvSettings.requireAdmissionApproval,
    // CV:SETTINGS:MANAGE) -- see that entity's doc comment for the incident
    // this fixes. false (default): skip straight to 'ENROLLED', matching
    // what most orgs actually want out of the box. true: leave 'PENDING'
    // until a CV:ADMISSIONS:APPROVE holder calls approveAdmission()/
    // rejectAdmission() below.
    const requireApproval = await this.settingsService.isAdmissionApprovalRequired(tenantId);

    // Since we need to coordinate across tables, we could use a transaction,
    // but the CVStudentProvider interface doesn't expose transaction objects.
    // In a real scenario we'd pass the QueryRunner or use a Transactional wrapper.
    // For now, we sequentially create. If Oracle provider is active, createStudent will throw.
    const student = await this.studentProvider.createStudent({
      firstName: dto.firstName,
      lastName: dto.lastName,
      // UnifiedStudent.dateOfBirth is `Date | null`; the DTO carries the raw
      // "YYYY-MM-DD" string validated by @IsDateString() above, so convert
      // here at the boundary rather than lying about the DTO's real type.
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      gender: dto.gender,
      admissionStatus: requireApproval ? 'PENDING' : 'ENROLLED',
      // Since CVStudentProvider doesn't handle all fields natively, we might need to update the entity.
      // But InternalStudentProvider createStudent saves it.
    });

    if (student.studentCode === null) {
      // It's internal adapter, we can manually update address etc via direct DB call if needed
      // but let's stick to the UnifiedStudent interface.
    }

    // Create guardians
    for (const g of dto.guardians) {
      const guardian = this.guardianRepo.create({
        tenantId,
        firstName: g.firstName,
        lastName: g.lastName,
        email: g.email,
        phone: g.phone,
        address: g.address,
      });
      const savedGuardian = await this.guardianRepo.save(guardian);

      const link = this.linkRepo.create({
        tenantId,
        studentId: student.id,
        guardianId: savedGuardian.id,
        relationship: g.relationship,
        isPrimaryGuardian: g.isPrimaryGuardian || false,
        isEmergencyContact: g.isEmergencyContact || false,
      });
      await this.linkRepo.save(link);
    }

    // Create Medical Profile
    if (dto.bloodGroup || dto.allergies || dto.disabilityType) {
      const medical = this.medicalRepo.create({
        tenantId,
        studentId: student.id,
        bloodGroup: dto.bloodGroup,
        allergies: dto.allergies,
        disabilityType: dto.disabilityType,
        updatedBy: actorId,
      });
      await this.medicalRepo.save(medical);
    }

    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_ADMISSION_CREATED',
      tenantId,
      userId: actorId,
      entityId: student.id,
      entityType: 'cv_students',
      metadata: { admissionName: student.firstName },
    });

    return student;
  }

  /**
   * Approve/reject only make sense while CvSettings.requireAdmissionApproval
   * is (or was, at admission time) true -- a student not currently 'PENDING'
   * means either the setting was off when they were admitted (already
   * 'ENROLLED', nothing to approve) or someone already actioned this one.
   * Rejecting an errant automatic 'ENROLLED' admission isn't this
   * endpoint's job -- that's an ordinary student-status change, not an
   * admission decision.
   */
  async approveAdmission(studentId: string, actorId: string): Promise<UnifiedStudent> {
    return this.transitionAdmission(studentId, actorId, 'ENROLLED', 'CV_ADMISSION_APPROVED');
  }

  async rejectAdmission(studentId: string, actorId: string): Promise<UnifiedStudent> {
    return this.transitionAdmission(studentId, actorId, 'REJECTED', 'CV_ADMISSION_REJECTED');
  }

  private async transitionAdmission(
    studentId: string,
    actorId: string,
    newStatus: 'ENROLLED' | 'REJECTED',
    auditAction: string,
  ): Promise<UnifiedStudent> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required for admissions');
    }

    const existing = await this.studentProvider.getStudentById(studentId);
    if (!existing) {
      throw new BadRequestException(`Student ${studentId} not found`);
    }
    if (existing.admissionStatus !== 'PENDING') {
      throw new BadRequestException(
        `Admission for ${existing.firstName} ${existing.lastName} is already '${existing.admissionStatus}', not 'PENDING' -- nothing to approve/reject.`,
      );
    }

    const updated = await this.studentProvider.updateStudent(studentId, { admissionStatus: newStatus });

    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: auditAction,
      tenantId,
      userId: actorId,
      entityId: studentId,
      entityType: 'cv_students',
      metadata: { admissionName: `${updated.firstName} ${updated.lastName}`, newStatus },
    });

    return updated;
  }
}
