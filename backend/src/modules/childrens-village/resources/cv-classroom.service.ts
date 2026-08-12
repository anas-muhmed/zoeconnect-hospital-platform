import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CvClassroom } from './entities/cv-classroom.entity';
import { AuditService } from '../../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface UpsertClassroomDto {
  name?: string;
  roomType?: string;
  capacity?: number;
  accessibilityFeatures?: string[];
  assignedTeacherId?: string | null;
  isActive?: boolean;
}

export interface SetMaintenanceWindowDto {
  maintenanceFrom: string | null;
  maintenanceTo: string | null;
  maintenanceNotes?: string | null;
}

/**
 * Timetable Management Phase 8 -- CRUD + maintenance-window management for
 * `CvClassroom`, the room/resource FK target `cv_timetable_periods.resourceId`
 * (Phase 1) and the Conflict Engine's `checkRoomConflict`/new
 * `checkResourceAvailability` (this phase) both point at. This is the first
 * service `CvClassroom` has ever had -- previously it was wired only as an
 * entity/relation target with no way to actually manage the room list, a
 * gap this phase closes without touching any other module.
 */
@Injectable()
export class CvClassroomService {
  constructor(
    @InjectRepository(CvClassroom)
    private readonly writeRepo: Repository<CvClassroom>,
    @Inject(getTenantScopedRepositoryToken(CvClassroom))
    private readonly readRepo: TenantScopedRepository<CvClassroom>,

    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async findAll(includeInactive = false): Promise<CvClassroom[]> {
    const rooms = await this.readRepo.find({ order: { name: 'ASC' } });
    return includeInactive ? rooms : rooms.filter((r) => r.isActive);
  }

  async findByIdOrThrow(id: string): Promise<CvClassroom> {
    const room = await this.readRepo.findOne({ where: { id } });
    if (!room) throw new NotFoundException(`Classroom/resource ${id} not found`);
    return room;
  }

  async create(actorId: string, dto: UpsertClassroomDto): Promise<CvClassroom> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) throw new Error('Tenant context required');
    if (!dto.name || !dto.roomType || dto.capacity == null) {
      throw new BadRequestException('name, roomType, and capacity are required');
    }

    const room = this.writeRepo.create({
      tenantId,
      name: dto.name,
      roomType: dto.roomType,
      capacity: dto.capacity,
      accessibilityFeatures: dto.accessibilityFeatures ?? [],
      assignedTeacherId: dto.assignedTeacherId ?? null,
      isActive: dto.isActive ?? true,
      createdBy: actorId,
      updatedBy: actorId,
    });
    const saved = await this.writeRepo.save(room);

    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_CLASSROOM_CREATED',
      entityType: 'cv_classrooms',
      entityId: saved.id,
      userId: actorId,
      metadata: { name: saved.name, roomType: saved.roomType },
    });
    return saved;
  }

  async update(actorId: string, id: string, dto: UpsertClassroomDto): Promise<CvClassroom> {
    const room = await this.findByIdOrThrow(id);

    if (dto.name !== undefined) room.name = dto.name;
    if (dto.roomType !== undefined) room.roomType = dto.roomType;
    if (dto.capacity !== undefined) room.capacity = dto.capacity;
    if (dto.accessibilityFeatures !== undefined) room.accessibilityFeatures = dto.accessibilityFeatures;
    if (dto.assignedTeacherId !== undefined) room.assignedTeacherId = dto.assignedTeacherId;
    if (dto.isActive !== undefined) room.isActive = dto.isActive;
    room.updatedBy = actorId;

    const saved = await this.writeRepo.save(room);
    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_CLASSROOM_UPDATED',
      entityType: 'cv_classrooms',
      entityId: saved.id,
      userId: actorId,
      metadata: { updates: dto },
    });
    return saved;
  }

  /**
   * Sets/clears the maintenance window (design spec Section 3's
   * "resource-maintenance edge case"). Both dates null clears it. Purely
   * data -- actually respecting the window at booking time is the Conflict
   * Engine's job (`checkResourceAvailability`, added this phase), not
   * enforced here, matching this module's report-only conflict philosophy.
   */
  async setMaintenanceWindow(actorId: string, id: string, dto: SetMaintenanceWindowDto): Promise<CvClassroom> {
    const room = await this.findByIdOrThrow(id);
    if (dto.maintenanceFrom && dto.maintenanceTo && dto.maintenanceFrom > dto.maintenanceTo) {
      throw new BadRequestException('maintenanceFrom cannot be after maintenanceTo');
    }

    room.maintenanceFrom = dto.maintenanceFrom ? new Date(dto.maintenanceFrom) : null;
    room.maintenanceTo = dto.maintenanceTo ? new Date(dto.maintenanceTo) : null;
    room.maintenanceNotes = dto.maintenanceNotes ?? null;
    room.updatedBy = actorId;

    const saved = await this.writeRepo.save(room);
    await this.auditService.log({
      module: 'CHILDRENS_VILLAGE',
      action: 'CV_CLASSROOM_MAINTENANCE_WINDOW_SET',
      entityType: 'cv_classrooms',
      entityId: saved.id,
      userId: actorId,
      metadata: { maintenanceFrom: dto.maintenanceFrom, maintenanceTo: dto.maintenanceTo },
    });
    return saved;
  }
}
