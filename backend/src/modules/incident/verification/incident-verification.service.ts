import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentVerification } from '../entities/incident-verification.entity';
import { IncidentCapa } from '../entities/incident-capa.entity';
import { IncidentService } from '../incidents/incident.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';
import { AuditService } from '../../audit/audit.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { VerifyCapaDto } from '../dto/incident-verification.dto';
import type { User } from '../../users/entities/user.entity';

/**
 * IncidentVerificationService — quality team verification of CAPAs.
 *
 * Outcomes:
 *   APPROVED         → CAPA is accepted; when all CAPAs approved, incident → CLOSED-ready
 *   REJECTED         → CAPA is automatically REOPENED, incident ← CAPA_PENDING
 *   NEED_MORE_EVIDENCE → CAPA stays COMPLETED but is flagged for additional evidence
 *
 * Multiple verification attempts per CAPA are allowed (each is a new row).
 */
@Injectable()
export class IncidentVerificationService {
  private readonly logger = new Logger(IncidentVerificationService.name);

  constructor(
    @InjectRepository(IncidentVerification)
    private readonly verifyRepo: Repository<IncidentVerification>,
    @InjectRepository(IncidentCapa)
    private readonly capaRepo: Repository<IncidentCapa>,
    private readonly incidentService: IncidentService,
    private readonly timeline: IncidentTimelineService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async verify(incidentId: string, capaId: string, dto: VerifyCapaDto, actor: User): Promise<IncidentVerification> {
    const capa = await this.capaRepo.findOne({ where: { id: capaId, incidentId } });
    if (!capa) throw new NotFoundException(`CAPA ${capaId} not found on incident ${incidentId}`);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();

    const verification = this.verifyRepo.create({
      tenantId,
      capaId,
      incidentId,
      outcome: dto.outcome,
      verifiedById: actor.id,
      notes: dto.notes ?? null,
      verifiedAt: new Date(),
    });

    const saved = await this.verifyRepo.save(verification);

    if (dto.outcome === 'APPROVED') {
      await this.timeline.emit({
        incidentId,
        eventType: 'VERIFICATION_APPROVED',
        actorId: actor.id,
        actorName: actor.fullName ?? actor.username,
        description: `CAPA "${capa.title}" verified and approved`,
        metadata: { capaId, verificationId: saved.id },
      });

      // Check if all CAPAs are approved → ready for closure
      await this.checkAllApproved(incidentId, actor);

    } else if (dto.outcome === 'REJECTED') {
      // Auto-reopen CAPA
      await this.capaRepo.update(capaId, { status: 'REOPENED' });

      // Transition incident back to CAPA_PENDING
      try {
        await this.incidentService.transition(incidentId, 'CAPA_PENDING', actor, {
          reason: 'Verification rejected',
          capaId,
        });
      } catch (e) {
        this.logger.debug(`Could not revert to CAPA_PENDING: ${e.message}`);
      }

      await this.timeline.emit({
        incidentId,
        eventType: 'VERIFICATION_REJECTED',
        actorId: actor.id,
        actorName: actor.fullName ?? actor.username,
        description: `CAPA "${capa.title}" verification REJECTED — CAPA has been reopened`,
        metadata: { capaId, verificationId: saved.id, notes: dto.notes },
      });

    } else {
      // NEED_MORE_EVIDENCE — flag only
      await this.timeline.emit({
        incidentId,
        eventType: 'VERIFICATION_PENDING_EVIDENCE',
        actorId: actor.id,
        actorName: actor.fullName ?? actor.username,
        description: `CAPA "${capa.title}" needs more evidence before verification`,
        metadata: { capaId, verificationId: saved.id },
      });
    }

    await this.audit.log({
      action: 'CAPA_VERIFIED',
      module: 'INCIDENT',
      userId: actor.id,
      entityType: 'IncidentVerification',
      entityId: saved.id,
      newValue: { outcome: dto.outcome, capaId } as Record<string, unknown>,
    });

    return saved;
  }

  private async checkAllApproved(incidentId: string, actor: User): Promise<void> {
    const all = await this.capaRepo.find({ where: { incidentId } });
    const allVerified = all.every(c => c.status === 'COMPLETED' || c.status === 'REJECTED');

    if (allVerified) {
      // Incident is ready for closure — emit timeline event; actual closure requires explicit CLOSE call
      await this.timeline.emit({
        incidentId,
        eventType: 'ALL_CAPA_VERIFIED',
        actorId: actor.id,
        actorName: actor.fullName ?? actor.username,
        description: 'All CAPAs have been verified. Incident is ready for closure.',
      });
    }
  }

  async getForCapa(capaId: string): Promise<IncidentVerification[]> {
    return this.verifyRepo.find({ where: { capaId }, order: { verifiedAt: 'DESC' } });
  }

  async getForIncident(incidentId: string): Promise<IncidentVerification[]> {
    return this.verifyRepo.find({ where: { incidentId }, order: { verifiedAt: 'DESC' } });
  }
}
