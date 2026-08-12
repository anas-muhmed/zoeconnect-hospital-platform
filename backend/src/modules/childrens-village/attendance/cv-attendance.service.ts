import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvStudentAttendance } from './entities/cv-student-attendance.entity';

@Injectable()
export class CvAttendanceService {
  constructor(
    private readonly tenantContext: TenantContextStorage,
    private readonly auditService: AuditService,
    @InjectRepository(CvStudentAttendance)
    private readonly attendanceRepo: Repository<CvStudentAttendance>,
  ) {}

  async markAttendance(actorId: string, attendanceData: Partial<CvStudentAttendance>[]) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');

    const records = attendanceData.map(d => this.attendanceRepo.create({
      ...d,
      tenantId,
      recordedBy: actorId,
    }));

    // In a real app, we might upsert or delete previous records for the same day
    const saved = await this.attendanceRepo.save(records);

    this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_ATTENDANCE_MARKED',
      tenantId,
      userId: actorId,
      entityId: saved[0]?.id || 'bulk', // simplified
      entityType: 'cv_student_attendance',
      metadata: { count: saved.length },
    });

    return saved;
  }

  async getStudentAttendance(studentId: string, startDate: string, endDate: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    
    // Simplification for date range querying in TypeORM
    return await this.attendanceRepo.createQueryBuilder('att')
      .where('att.student_id = :studentId', { studentId })
      .andWhere('att.date >= :startDate', { startDate })
      .andWhere('att.date <= :endDate', { endDate })
      .orderBy('att.date', 'DESC')
      .getMany();
  }
}
