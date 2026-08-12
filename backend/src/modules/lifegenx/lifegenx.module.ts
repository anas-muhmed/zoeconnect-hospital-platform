import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LifeGenXConsultation } from './entities/lifegenx-consultation.entity';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import { TenantModule } from '../platform/tenant/tenant.module';
import { StorageModule } from '../platform/services/object-repository/object-repository.module';

import { LifeGenXConsultationsController } from './controllers/lifegenx-consultations.controller';
import { LifeGenXAiController } from './controllers/lifegenx-ai.controller';
import { LifeGenXAudioController } from './controllers/lifegenx-audio.controller';
import { LifeGenXConsultationsService } from './services/lifegenx-consultations.service';
import { LifeGenXAiService } from './services/lifegenx-ai.service';
import { LifeGenXAudioService } from './services/lifegenx-audio.service';

/**
 * LifeGenX integration (delivery phase). AI clinical symptom extraction &
 * diagnosis — audio consultation -> transcript -> AI symptom extraction ->
 * AI differential diagnosis, plus a general clinical AI chatbot (ZoiBot).
 *
 * Depends only on shared ZoeConnect platform infrastructure — `TenantModule`
 * (tenant-scoped repository + `TenantContextInterceptor`) and `StorageModule`
 * (audio file storage, same `ObjectRepositoryService` the CMS/Feedback/
 * Token modules already use) — never on Mortuary, Drug Indenting, or
 * CliniGrowth.
 *
 * The source's own auth system (bcrypt + JWT, including a live universal-
 * password bypass — see `1797000000000-SeedLifeGenXRbac`'s doc comment)
 * is entirely replaced by ZoeConnect's `User`/RBAC; no `User` entity is
 * ported here.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LifeGenXConsultation]),
    TenantModule,
    StorageModule,
  ],
  controllers: [LifeGenXConsultationsController, LifeGenXAiController, LifeGenXAudioController],
  providers: [
    createTenantScopedRepositoryProvider(LifeGenXConsultation),
    LifeGenXConsultationsService,
    LifeGenXAiService,
    LifeGenXAudioService,
  ],
  exports: [],
})
export class LifeGenXModule {}
