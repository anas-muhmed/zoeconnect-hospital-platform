import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LifeGenXConsultation } from '../entities/lifegenx-consultation.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { CreateConsultationDto } from '../dto/create-consultation.dto';

export interface ConsultationFilterOptions {
  search?: string;
  doctorName?: string;
  patientName?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

function parseConsultation(row: LifeGenXConsultation) {
  return {
    ...row,
    symptoms: JSON.parse(row.symptoms || '[]'),
    observations: JSON.parse(row.observations || '[]'),
    diagnoses: JSON.parse(row.diagnoses || '[]'),
  };
}

/**
 * LifeGenX integration (delivery phase). Ports `services/consultation.
 * service.ts`. Business behavior preserved as-is: any authenticated
 * clinician in the tenant may view every consultation in that tenant
 * (the source's `doctorName` filter param implies intentional shared-
 * practice visibility, not a per-doctor silo) — tenant-scoping is the
 * real fix here (source had none at all), not narrowing visibility
 * further within a tenant.
 */
@Injectable()
export class LifeGenXConsultationsService {
  constructor(
    @InjectRepository(LifeGenXConsultation)
    private readonly consultationRepo: Repository<LifeGenXConsultation>,
    @Inject(getTenantScopedRepositoryToken(LifeGenXConsultation))
    private readonly scopedConsultationRepo: TenantScopedRepository<LifeGenXConsultation>,
  ) {}

  async create(tenantId: string, doctorId: string, dto: CreateConsultationDto) {
    const entity = this.consultationRepo.create({
      tenantId,
      doctorId,
      patientName: dto.patientName || 'Anonymous Patient',
      patientAge: dto.patientAge ?? null,
      patientGender: dto.patientGender || 'Unspecified',
      audioPath: dto.audioPath ?? null,
      audioFileName: dto.audioFileName ?? null,
      duration: dto.duration ?? null,
      transcript: dto.transcript,
      symptoms: JSON.stringify(dto.symptoms || []),
      observations: JSON.stringify(dto.observations || []),
      diagnoses: JSON.stringify(dto.diagnoses || []),
    });
    const saved = await this.consultationRepo.save(entity);
    return parseConsultation(saved);
  }

  async list(tenantId: string, options: ConsultationFilterOptions) {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const skip = (page - 1) * limit;

    const qb = (await this.scopedConsultationRepo.createQueryBuilder('c'))
      .leftJoin('users', 'u', 'u.id = c.doctorId')
      .addSelect(['u.full_name AS doctor_name', 'u.email AS doctor_email'])
      .andWhere('c.tenantId = :tenantId', { tenantId });

    if (options.search) {
      qb.andWhere(
        '(c.patientName ILIKE :search OR c.transcript ILIKE :search OR c.symptoms ILIKE :search OR c.diagnoses ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }
    if (options.patientName) {
      qb.andWhere('c.patientName ILIKE :patientName', { patientName: `%${options.patientName}%` });
    }
    if (options.doctorName) {
      qb.andWhere('u.full_name ILIKE :doctorName', { doctorName: `%${options.doctorName}%` });
    }
    if (options.startDate) {
      qb.andWhere('c.createdAt >= :startDate', { startDate: options.startDate });
    }
    if (options.endDate) {
      qb.andWhere('c.createdAt <= :endDate', { endDate: options.endDate });
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('c.createdAt', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawAndEntities();

    const consultations = rows.entities.map((entity, i) => ({
      ...parseConsultation(entity),
      doctor: {
        id: entity.doctorId,
        name: rows.raw[i]?.doctor_name ?? null,
        email: rows.raw[i]?.doctor_email ?? null,
      },
    }));

    return { total, page, limit, totalPages: Math.ceil(total / limit), consultations };
  }

  async findOne(tenantId: string, id: string) {
    const row = await this.scopedConsultationRepo.findOneBy({ tenantId, id });
    if (!row) throw new NotFoundException('Consultation record not found');
    return parseConsultation(row);
  }

  async dashboardMetrics(tenantId: string) {
    const totalConsultations = await this.scopedConsultationRepo.count({ where: { tenantId } });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayDiagnoses = await this.consultationRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.createdAt >= :todayStart', { todayStart })
      .getCount();

    const todayAudioUploaded = await this.consultationRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId })
      .andWhere('c.createdAt >= :todayStart', { todayStart })
      .andWhere('c.audioPath IS NOT NULL')
      .getCount();

    const recent = await this.scopedConsultationRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    return {
      totalConsultations,
      todayDiagnoses,
      todayAudioUploaded,
      recentConsultations: recent.map(parseConsultation),
    };
  }
}
