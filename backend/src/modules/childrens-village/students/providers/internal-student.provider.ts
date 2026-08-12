import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CVStudentProvider, UnifiedStudent, ListStudentsParams, ListStudentsResult } from '../interfaces/cv-student.interface';
import { TenantContextStorage } from '../../../platform/tenant/context/tenant-context-storage';
import { TenantScopedRepository } from '../../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../../platform/tenant/repositories/tenant-scoped-repository.provider';
import { CvStudent } from '../entities/cv-student.entity';

@Injectable()
export class InternalStudentProvider implements CVStudentProvider {
  constructor(
    @Inject(getTenantScopedRepositoryToken(CvStudent))
    private readonly readRepo: TenantScopedRepository<CvStudent>,
    @InjectRepository(CvStudent)
    private readonly writeRepo: Repository<CvStudent>,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  private toUnified(student: CvStudent): UnifiedStudent {
    return {
      id: student.id,
      registrationNumber: student.registrationNumber,
      admissionNumber: student.admissionNumber,
      studentCode: student.studentCode,
      admissionStatus: student.admissionStatus,
      studentStatus: student.studentStatus,
      firstName: student.firstName,
      lastName: student.lastName,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      parentName: student.parentName,
      parentContact: student.parentContact,
      source: 'INTERNAL',
    };
  }

  async searchStudents(query: string): Promise<UnifiedStudent[]> {
    const qb = await this.readRepo.createQueryBuilder('student');
    qb.where('student.registrationNumber ILIKE :query', { query: `%${query}%` })
      .orWhere('student.firstName ILIKE :query', { query: `%${query}%` })
      .orWhere('student.lastName ILIKE :query', { query: `%${query}%` })
      .orWhere('student.parentContact ILIKE :query', { query: `%${query}%` })
      .take(50);
      
    const results = await qb.getMany();
    return results.map((r: CvStudent) => this.toUnified(r));
  }

  async listStudents(params: ListStudentsParams): Promise<ListStudentsResult> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const qb = await this.readRepo.createQueryBuilder('student');
    qb.orderBy('student.createdAt', 'DESC');

    if (params.admissionStatus) {
      qb.andWhere('student.admissionStatus = :admissionStatus', { admissionStatus: params.admissionStatus });
    }
    if (params.query && params.query.trim().length > 0) {
      qb.andWhere(
        '(student.registrationNumber ILIKE :q OR student.firstName ILIKE :q OR student.lastName ILIKE :q OR student.parentContact ILIKE :q)',
        { q: `%${params.query.trim()}%` },
      );
    }

    qb.skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((r: CvStudent) => this.toUnified(r)), total };
  }

  async getStudentById(id: string): Promise<UnifiedStudent | null> {
    const student = await this.readRepo.findOne({ where: { id } });
    if (!student) {
      return null;
    }
    return this.toUnified(student);
  }

  async createStudent(data: Partial<UnifiedStudent>): Promise<UnifiedStudent> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) {
      throw new Error('Tenant context is required to create a student in the internal adapter');
    }

    const entity = this.writeRepo.create({
      tenantId,
      registrationNumber: data.registrationNumber || `REG-${Date.now()}`, // Simple fallback for now
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth,
      gender: data.gender,
      parentName: data.parentName,
      parentContact: data.parentContact,
      // Bug fix (2026-08-03): this was previously silently dropped even
      // though the `UnifiedStudent`/`CreateStudent` contract carries it --
      // every admission fell through to the entity's 'PENDING' column
      // default with no way to ever change it. CvAdmissionsService now
      // decides the value based on CvSettings.requireAdmissionApproval and
      // passes it through here.
      ...(data.admissionStatus !== undefined ? { admissionStatus: data.admissionStatus } : {}),
    });
    
    const saved = await this.writeRepo.save(entity);
    return this.toUnified(saved);
  }

  async updateStudent(id: string, data: Partial<UnifiedStudent>): Promise<UnifiedStudent> {
    const student = await this.readRepo.findOne({ where: { id } });
    if (!student) {
      throw new NotFoundException(`Student ${id} not found.`);
    }

    if (data.firstName !== undefined) student.firstName = data.firstName;
    if (data.lastName !== undefined) student.lastName = data.lastName;
    if (data.dateOfBirth !== undefined) student.dateOfBirth = data.dateOfBirth;
    if (data.gender !== undefined) student.gender = data.gender;
    if (data.parentName !== undefined) student.parentName = data.parentName;
    if (data.parentContact !== undefined) student.parentContact = data.parentContact;
    // Needed for the approve/reject actions in CvAdmissionsController.
    if (data.admissionStatus !== undefined) student.admissionStatus = data.admissionStatus;

    const saved = await this.writeRepo.save(student);
    return this.toUnified(saved);
  }
}
