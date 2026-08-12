import { Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CmsAssetCleanupService } from './cms-asset-cleanup.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cms/asset-cleanup')
export class CmsAssetCleanupController {
  constructor(private readonly cleanupService: CmsAssetCleanupService) {}

  @Post('run')
  @RequirePermissions('CMS:MEDIA:MANAGE')
  run(@Request() req: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = req.user?.id ?? req.user?.sub ?? 'unknown';
    return this.cleanupService.cleanupOrphanedMedia(userId);
  }
}
