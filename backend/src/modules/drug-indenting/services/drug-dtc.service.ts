import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DrugRequest } from '../entities/drug-request.entity';
import { DrugAlternative } from '../entities/drug-alternative.entity';
import { BlacklistedCompany } from '../entities/blacklisted-company.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { DrugIndentingRequestContext } from '../drug-indenting-request-context';
import { STAGES } from '../drug-indenting-workflow.util';
import { DtcFinalSelectDto } from '../dto/dtc-final-select.dto';
import { CreateBlacklistedCompanyDto } from '../dto/blacklist-company.dto';
import { DrugAuditLog } from '../entities/drug-audit-log.entity';

/**
 * Drug Indenting integration (delivery phase). Ports `routes/dtc.js`'s
 * `/final-select` (DTCFinal stage's drug-selection decision, blocked from
 * the generic `/approve` endpoint on purpose — see `DrugRequestsService.
 * approve()`) and the blacklist-management endpoints.
 *
 * Deferred in this pass (documented, not silently dropped): persisting
 * per-row DTC remarks onto `drug_existing_details` (that table isn't
 * ported — out of scope, same as the module inventory's other deferred
 * tables). Per-alternative remark/negotiation-remark updates from the
 * final-select payload ARE preserved below.
 */
@Injectable()
export class DrugDtcService {
  constructor(
    @InjectRepository(DrugRequest)
    private readonly requestRepo: Repository<DrugRequest>,
    @Inject(getTenantScopedRepositoryToken(DrugRequest))
    private readonly scopedRequestRepo: TenantScopedRepository<DrugRequest>,
    @Inject(getTenantScopedRepositoryToken(DrugAlternative))
    private readonly scopedAltRepo: TenantScopedRepository<DrugAlternative>,
    @Inject(getTenantScopedRepositoryToken(BlacklistedCompany))
    private readonly scopedBlacklistRepo: TenantScopedRepository<BlacklistedCompany>,
    @InjectRepository(BlacklistedCompany)
    private readonly blacklistRepo: Repository<BlacklistedCompany>,
    @InjectRepository(DrugAuditLog)
    private readonly auditRepo: Repository<DrugAuditLog>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private async writeAudit(tenantId: string, requestId: string, action: string, performedBy: string, fromStage: string | null, toStage: string | null, remarks?: string | null) {
    await this.auditRepo.insert({ tenantId, requestId, action, performedBy, fromStage, toStage, remarks: remarks || null });
  }

  async finalSelect(ctx: DrugIndentingRequestContext, requestId: string, dto: DtcFinalSelectDto) {
    const dr = await this.scopedRequestRepo.findOneBy({ tenantId: ctx.tenantId, id: requestId });
    if (!dr) throw new NotFoundException('Request not found.');
    if (dr.currentStage !== STAGES.DTC_FINAL) {
      throw new BadRequestException('Final drug selection is only allowed at DTCFinal stage.');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(DrugAlternative, { tenantId: ctx.tenantId, requestId }, { isFinalSelected: false });

      let recs = dto.recommendations;
      if (!recs || recs.length === 0) {
        let selectedName = dr.brandName;
        if (dto.selectionType === 'alternative' && dto.selectedAlternativeId) {
          const alt = await manager.findOneBy(DrugAlternative, { tenantId: ctx.tenantId, id: dto.selectedAlternativeId, requestId });
          if (alt) selectedName = alt.brandName;
        }
        recs = [{
          brandName: dto.dtcSelectedBrand || selectedName,
          category: dto.dtcSelectedCategory || 'Formulary',
          reasons: dto.dtcSelectionReasons || ['DTC Approved'],
          isOriginal: dto.selectionType === 'original' || (!dto.selectedAlternativeId && dto.selectionType !== 'alternative'),
          alternativeId: dto.selectionType === 'alternative' ? dto.selectedAlternativeId : undefined,
        }];
      }

      const selectedAltIds = recs.filter((r) => !r.isOriginal && r.alternativeId).map((r) => r.alternativeId as string);
      if (selectedAltIds.length > 0) {
        await manager
          .createQueryBuilder()
          .update(DrugAlternative)
          .set({ isFinalSelected: true })
          .where('tenantId = :tenantId AND requestId = :requestId AND id IN (:...ids)', { tenantId: ctx.tenantId, requestId, ids: selectedAltIds })
          .execute();
      }

      const selectedBrandsList = recs.length > 0 ? recs.map((r) => r.brandName).join(', ') : 'DTC Reviewed';
      const hasFormulary = recs.some((r) => r.category === 'FORMULARY');
      const aggregatedCategory = hasFormulary ? 'FORMULARY' : (recs[0]?.category || 'NON_FORMULARY');

      const allReasons = new Set<string>();
      recs.forEach((r) => (r.reasons || []).forEach((reason) => allReasons.add(reason)));
      const selectionReasonsJson = JSON.stringify(Array.from(allReasons));

      const finalNotes = recs.length > 0
        ? recs.map((r) => `${r.brandName}: [Notes: ${r.notes || '—'}][Remarks: ${r.remarks || '—'}]`).join(' | ')
        : (dto.dtcRecommendationNotes || dto.remarks || null);
      const recommendationsJson = JSON.stringify(recs);

      // Prefer the entry marked "Recommended" — picking blindly by array
      // order let a Not-Recommended alternative win selection whenever it
      // came first (same real bug the source fixed, preserved here).
      const recommendedAlt = recs.find((r) => !r.isOriginal && r.alternativeId && r.remarks === 'Recommended');
      const firstAlt = recommendedAlt || recs.find((r) => !r.isOriginal && r.alternativeId);
      const finalAltId = firstAlt?.alternativeId || null;

      await manager.update(DrugRequest, { tenantId: ctx.tenantId, id: requestId }, {
        finalSelectedAlternativeId: finalAltId,
        dtcFinalSelectionNotes: finalNotes,
        dtcFinalRemarks: dto.dtcRemarks || finalNotes || null,
        dtcRemarks: dto.dtcRemarks || finalNotes || null,
        dtcSelectedBrand: selectedBrandsList,
        dtcSelectedCategory: aggregatedCategory,
        dtcSelectionReasons: selectionReasonsJson,
        dtcRecommendationNotes: finalNotes,
        dtcReviewedBy: ctx.userId,
        dtcReviewedAt: new Date(),
        currentStage: STAGES.CEO,
        status: 'Pending',
        updatedAt: new Date(),
        dtcReviewedByName: dto.dtcReviewedByName || null,
        dtcReviewSignature: dto.dtcReviewSignature || null,
        finalSelectedBrand: selectedBrandsList,
        finalSelectedCategory: aggregatedCategory,
        finalSelectionReasons: selectionReasonsJson,
        finalRecommendationNotes: finalNotes,
        dtcFinalRecommendations: recommendationsJson,
      });

      if (dto.alternativeRemarks && dto.alternativeRemarks.length > 0) {
        for (const row of dto.alternativeRemarks) {
          if (row.remark !== undefined) {
            await manager.update(DrugAlternative, { tenantId: ctx.tenantId, id: row.altId, requestId }, { remark: row.remark });
          }
        }
      }

      await this.writeAudit(ctx.tenantId, requestId, 'DTC_FINAL_SELECTION', ctx.userId, STAGES.DTC_FINAL, STAGES.CEO, `Selected: ${selectedBrandsList}. ${dto.remarks || ''}`);
    });

    return { message: 'Final drug selected. Request forwarded to CEO.' };
  }

  // ── Blacklist management ────────────────────────────────────────────

  async createBlacklistEntry(ctx: DrugIndentingRequestContext, dto: CreateBlacklistedCompanyDto) {
    const normalizedName = dto.companyName.trim().toUpperCase();
    const dup = await this.scopedBlacklistRepo.findOneBy({
      tenantId: ctx.tenantId, isActive: true, companyName: normalizedName, companyType: dto.companyType,
    });
    if (dup) throw new ConflictException('Company is already blacklisted.');

    const entity = this.blacklistRepo.create({
      tenantId: ctx.tenantId,
      companyName: normalizedName,
      companyType: dto.companyType,
      remarks: dto.remarks?.trim() || null,
      createdBy: ctx.userId,
    });
    const saved = await this.blacklistRepo.save(entity);
    return { message: `${dto.companyType === 'MANUFACTURER' ? 'Manufacturer' : 'Marketer'} "${normalizedName}" added to blacklist.`, id: saved.id };
  }

  async listBlacklist(tenantId: string): Promise<BlacklistedCompany[]> {
    return this.scopedBlacklistRepo.find({ where: { tenantId, isActive: true }, order: { createdAt: 'DESC' } });
  }

  async removeBlacklistEntry(ctx: DrugIndentingRequestContext, blacklistId: string) {
    const entry = await this.scopedBlacklistRepo.findOneBy({ tenantId: ctx.tenantId, id: blacklistId, isActive: true });
    if (!entry) throw new NotFoundException('Blacklist entry not found or already removed.');
    await this.scopedBlacklistRepo.update({ tenantId: ctx.tenantId, id: blacklistId }, {
      isActive: false, removedBy: ctx.userId, removedAt: new Date(),
    });
    return { message: `Blacklist entry #${blacklistId} removed.` };
  }
}
