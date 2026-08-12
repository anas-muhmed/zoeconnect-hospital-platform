import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { CMSMedia }              from './entities/cms-media.entity';
import { CMSPlaylist }           from './entities/cms-playlist.entity';
import { CMSPlaylistItem }       from './entities/cms-playlist-item.entity';
import { CMSPublishVersion }     from './entities/cms-publish-version.entity';
import { CMSDisplayAssignment }  from './entities/cms-display-assignment.entity';
import { CMSPlaylistSchedule }   from './entities/cms-playlist-schedule.entity';
import { CMSAuditLog }           from './entities/cms-audit-log.entity';
import { CMSDisplayGroup }       from './entities/cms-display-group.entity';
import { CMSDisplayCommand }     from './entities/cms-display-command.entity';
import { CMSEmergencyBroadcast } from './entities/cms-emergency-broadcast.entity';
import { CMSSettings }           from './entities/cms-settings.entity';
import { CMSPlayerLog }          from './entities/cms-player-log.entity';
import { CMSTickerMessage }      from './entities/cms-ticker-message.entity';

// Audit
import { CmsAuditService }    from './audit/cms-audit.service';
import { CmsAuditController } from './audit/cms-audit.controller';

// Media
import { CmsMediaService }    from './media/cms-media.service';
import { CmsMediaController } from './media/cms-media.controller';

// Playlists
import { CmsPlaylistService }    from './playlist/cms-playlist.service';
import { CmsPlaylistController } from './playlist/cms-playlist.controller';

// Displays / player
import { CmsDisplayService }    from './display/cms-display.service';
import { CmsDisplayController } from './display/cms-display.controller';
import { CmsPublicPlayerController } from './display/cms-public-player.controller';

// Scheduling
import { CmsScheduleService }    from './schedule/cms-schedule.service';
import { CmsScheduleController } from './schedule/cms-schedule.controller';

// v1.0: Screen groups
import { CmsDisplayGroupService }    from './groups/cms-display-group.service';
import { CmsDisplayGroupController } from './groups/cms-display-group.controller';

// v1.0: Remote commands
import { CmsDisplayCommandService }    from './commands/cms-display-command.service';
import { CmsDisplayCommandController } from './commands/cms-display-command.controller';

// v1.0: Emergency broadcast
import { CmsEmergencyService }    from './emergency/cms-emergency.service';
import { CmsEmergencyController } from './emergency/cms-emergency.controller';

// v1.0: Global settings
import { CmsSettingsService }    from './settings/cms-settings.service';
import { CmsSettingsController } from './settings/cms-settings.controller';

// v1.0: Player logs / diagnostics
import { CmsPlayerLogService } from './logs/cms-player-log.service';

// v1.0: Asset cleanup
import { CmsAssetCleanupService }    from './cleanup/cms-asset-cleanup.service';
import { CmsAssetCleanupController } from './cleanup/cms-asset-cleanup.controller';

// Scrolling ticker
import { CmsTickerService }    from './ticker/cms-ticker.service';
import { CmsTickerController } from './ticker/cms-ticker.controller';

// Stage B (Checkpoint B3.6) — tenant scoping infrastructure
import { TenantModule }                         from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';

// Phase 2 (Hybrid Architecture) — object storage abstraction seam
import { StorageModule } from '../platform/services/object-repository/object-repository.module';

// Phase 11 (Hybrid Architecture) — per-tenant feature-flag gating (pilot: emergency broadcast)
import { FeatureFlagsModule } from '../platform/feature-flags/feature-flags.module';

/**
 * CmsModule --- Content Management System for digital signage.
 *
 * Fully independent from TokenModule / the existing Custom Display feature:
 * own entities, own tables (cms_*), own uploads subfolder (cms-media/), own
 * controllers/routes (/cms/*). No shared tables or files with Custom Display.
 *
 * v1.0 stabilization adds screen groups, display tags, remote commands,
 * maintenance mode, emergency override, asset cleanup, global settings,
 * diagnostics, and player logs on top of the Phase 1-3 foundation. The
 * player API is frozen under NestJS's existing global URI versioning
 * (`/api/v1/cms/player/...`, enabled in main.ts).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CMSMedia, CMSPlaylist, CMSPlaylistItem, CMSPublishVersion, CMSDisplayAssignment,
      CMSPlaylistSchedule, CMSAuditLog,
      CMSDisplayGroup, CMSDisplayCommand, CMSEmergencyBroadcast, CMSSettings, CMSPlayerLog,
      CMSTickerMessage,
    ]),
    TenantModule,
    StorageModule,
    FeatureFlagsModule,
  ],
  controllers: [
    CmsAuditController,
    CmsMediaController,
    CmsPlaylistController,
    CmsDisplayController,
    CmsPublicPlayerController,
    CmsScheduleController,
    CmsDisplayGroupController,
    CmsDisplayCommandController,
    CmsEmergencyController,
    CmsSettingsController,
    CmsAssetCleanupController,
    CmsTickerController,
  ],
  providers: [
    CmsAuditService,
    CmsMediaService,
    CmsPlaylistService,
    CmsDisplayService,
    CmsScheduleService,
    CmsDisplayGroupService,
    CmsDisplayCommandService,
    CmsEmergencyService,
    CmsSettingsService,
    CmsPlayerLogService,
    CmsAssetCleanupService,
    CmsTickerService,

    // Stage B (Checkpoint B3.6) — scoped repositories for the 22 session-resolved
    // eligible read methods identified in the pre-flight. Alongside (not
    // replacing) the raw TypeOrmModule.forFeature repositories above.
    // CMSSettings gets no provider — CmsSettingsService.get() is
    // reachable from the chain-resolved player route and the asset-cleanup
    // cron in addition to its authenticated route, so it stays fully raw
    // per the pre-flight rather than being split.
    //
    // Promoted 'dry-run' -> 'enforced' (2026-07-16): part of the consolidated
    // audit/fix pass triggered by the confirmed Users cross-tenant leak — see
    // HYBRID_ARCHITECTURE_LOG.md / PHASE_10_DEFERRED_BACKLOG.md.
    createTenantScopedRepositoryProvider(CMSAuditLog, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSMedia, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSPlaylistItem, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSPlaylist, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSPublishVersion, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSDisplayAssignment, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSPlaylistSchedule, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSDisplayGroup, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSDisplayCommand, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSEmergencyBroadcast, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSPlayerLog, { mode: 'enforced' }),
    createTenantScopedRepositoryProvider(CMSTickerMessage, { mode: 'enforced' }),
  ],
  exports: [
    CmsAuditService,
    CmsMediaService,
    CmsPlaylistService,
    CmsDisplayService,
    CmsScheduleService,
    CmsDisplayGroupService,
    CmsDisplayCommandService,
    CmsEmergencyService,
    CmsSettingsService,
    CmsPlayerLogService,
    CmsAssetCleanupService,
    CmsTickerService,
  ],
})
export class CmsModule {}
