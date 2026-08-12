import { Injectable, Inject } from '@nestjs/common';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';

import { CvAnalyticsSnapshot } from './entities/cv-analytics-snapshot.entity';
import { CvEventTimeline } from './entities/cv-event-timeline.entity';
import { CvStudent } from '../students/entities/cv-student.entity';
import { CvClass } from '../classes/entities/cv-class.entity';
import { CvStudentAllocation } from '../students/entities/cv-student-allocation.entity';
import { CvAcademicYear } from '../academic-years/entities/cv-academic-year.entity';

function groupCount<T extends Record<string, any>>(items: T[], key: keyof T, fallback = 'UNSPECIFIED'): Record<string, number> {
  return items.reduce((acc, item) => {
    const rawValue = item[key];
    const value = (rawValue === null || rawValue === undefined || rawValue === '') ? fallback : String(rawValue);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function ageFromDob(dob: Date | string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasNotHadBirthdayThisYear = (now.getMonth() < birth.getMonth())
    || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (hasNotHadBirthdayThisYear) age -= 1;
  return age;
}

function ageBucket(age: number | null): string {
  if (age === null) return 'Unspecified';
  if (age <= 2) return '0-2 yrs';
  if (age <= 5) return '3-5 yrs';
  if (age <= 8) return '6-8 yrs';
  if (age <= 12) return '9-12 yrs';
  return '13+ yrs';
}

@Injectable()
export class CvAnalyticsService {
  constructor(
    private readonly tenantContext: TenantContextStorage,

    @InjectRepository(CvAnalyticsSnapshot) private readonly snapWriteRepo: Repository<CvAnalyticsSnapshot>,
    @InjectRepository(CvEventTimeline) private readonly eventWriteRepo: Repository<CvEventTimeline>,

    @Inject(getTenantScopedRepositoryToken(CvAnalyticsSnapshot)) private readonly snapReadRepo: TenantScopedRepository<CvAnalyticsSnapshot>,
    @Inject(getTenantScopedRepositoryToken(CvEventTimeline)) private readonly eventReadRepo: TenantScopedRepository<CvEventTimeline>,

    @Inject(getTenantScopedRepositoryToken(CvStudent)) private readonly studentReadRepo: TenantScopedRepository<CvStudent>,
    @Inject(getTenantScopedRepositoryToken(CvClass)) private readonly classReadRepo: TenantScopedRepository<CvClass>,
    @Inject(getTenantScopedRepositoryToken(CvStudentAllocation)) private readonly allocationReadRepo: TenantScopedRepository<CvStudentAllocation>,
    @Inject(getTenantScopedRepositoryToken(CvAcademicYear)) private readonly academicYearReadRepo: TenantScopedRepository<CvAcademicYear>,
  ) {}

  /**
   * Aggregated stats for the Children's Village landing dashboard.
   * Replaces the previously hardcoded stat cards with live tenant-scoped data.
   */
  async getDashboardStats() {
    const [academicYears, classes, students, activeAllocations] = await Promise.all([
      this.academicYearReadRepo.find({}),
      this.classReadRepo.find({}),
      this.studentReadRepo.find({}),
      this.allocationReadRepo.find({ where: { status: 'ACTIVE' } }),
    ]);

    const activeAcademicYear = academicYears.find((y) => y.isActive) ?? null;
    const activeClasses = classes.filter((c) => c.isActive);

    const totalCapacity = activeClasses.reduce((sum, c) => sum + (c.capacity ?? 0), 0);
    const allocatedCount = activeAllocations.length;

    const allocationsByClass = groupCount(activeAllocations, 'classId', 'UNASSIGNED');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentAdmissions30d = students.filter((s) => s.createdAt && new Date(s.createdAt) >= thirtyDaysAgo).length;

    const ageGroupBreakdown = students.reduce((acc, s) => {
      const bucket = ageBucket(ageFromDob(s.dateOfBirth));
      acc[bucket] = (acc[bucket] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      activeAcademicYear: activeAcademicYear ? {
        name: activeAcademicYear.name,
        startDate: activeAcademicYear.startDate,
        endDate: activeAcademicYear.endDate,
      } : null,
      totalClasses: activeClasses.length,
      totalStudents: students.length,
      totalCapacity,
      capacityUtilizationPercent: totalCapacity > 0 ? Math.round((allocatedCount / totalCapacity) * 100) : 0,
      recentAdmissions30d,
      studentStatusBreakdown: groupCount(students, 'studentStatus'),
      admissionStatusBreakdown: groupCount(students, 'admissionStatus'),
      genderBreakdown: groupCount(students, 'gender'),
      ageGroupBreakdown,
      classCapacity: activeClasses.map((c) => ({
        id: c.id,
        name: c.name,
        ageGroup: c.ageGroup,
        capacity: c.capacity ?? 0,
        allocated: allocationsByClass[c.id] ?? 0,
      })),
    };
  }

  async generateDailySnapshot() {
    // In a real application, this runs via a Cron job every midnight
    // It queries the live transactional tables and computes flat KPIs
    // Example: average attendance per class, total behaviour incidents, etc.
  }

  async logEventForAI(actorId: string, studentId: string | null, eventType: string, payload: any, sourceId?: string, sourceType?: string) {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) return; // Silent fail or log warning for AI events if no context

    const evt = this.eventWriteRepo.create({
      tenantId,
      studentId,
      eventType,
      eventDate: new Date(),
      actorId,
      payload,
      sourceEntityId: sourceId,
      sourceEntityType: sourceType
    });

    await this.eventWriteRepo.save(evt);
    return evt;
  }

  async getTimelineForStudent(studentId: string) {
    return this.eventReadRepo.find({
      where: { studentId },
      order: { eventDate: 'DESC' },
      take: 50
    });
  }
}
