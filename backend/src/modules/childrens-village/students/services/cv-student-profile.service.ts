import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CVStudentProvider } from '../interfaces/cv-student.interface';
import { TenantScopedRepository } from '../../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../../platform/tenant/repositories/tenant-scoped-repository.provider';
import { CvGuardian } from '../entities/cv-guardian.entity';
import { CvStudentGuardianLink } from '../entities/cv-student-guardian-link.entity';
import { CvStudentMedicalProfile } from '../entities/cv-student-medical-profile.entity';
import { CvStudentAllocation } from '../entities/cv-student-allocation.entity';

@Injectable()
export class CvStudentProfileService {
  constructor(
    @Inject(CVStudentProvider)
    private readonly studentProvider: CVStudentProvider,
    @Inject(getTenantScopedRepositoryToken(CvStudentGuardianLink))
    private readonly linkRepo: TenantScopedRepository<CvStudentGuardianLink>,
    @Inject(getTenantScopedRepositoryToken(CvStudentMedicalProfile))
    private readonly medicalRepo: TenantScopedRepository<CvStudentMedicalProfile>,
    @Inject(getTenantScopedRepositoryToken(CvStudentAllocation))
    private readonly allocationRepo: TenantScopedRepository<CvStudentAllocation>,
  ) {}

  async getStudentProfile(id: string) {
    const student = await this.studentProvider.getStudentById(id);
    if (!student) {
      throw new NotFoundException(`Student ${id} not found.`);
    }

    // Since the database entities are tenant-scoped, we can just query by studentId
    const guardianLinks = await this.linkRepo.find({
      where: { studentId: id },
      relations: ['guardian'],
    });

    const medicalProfile = await this.medicalRepo.findOne({
      where: { studentId: id },
    });

    const currentAllocation = await this.allocationRepo.findOne({
      where: { studentId: id, status: 'ACTIVE' },
      relations: ['cvClass', 'academicYear'],
    });

    return {
      student,
      guardians: guardianLinks.map(link => ({
        ...link.guardian,
        relationship: link.relationship,
        guardianType: link.guardianType,
        isPrimaryGuardian: link.isPrimaryGuardian,
        isEmergencyContact: link.isEmergencyContact,
      })),
      medicalProfile,
      currentAllocation,
    };
  }
}
