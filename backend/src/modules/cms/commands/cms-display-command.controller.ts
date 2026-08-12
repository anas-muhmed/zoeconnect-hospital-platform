import { Controller, Get, Post, Param, Body, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CmsDisplayCommandService } from './cms-display-command.service';
import { CmsCommandType } from '../entities/cms-display-command.entity';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@Controller('cms/display-commands')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
export class CmsDisplayCommandController {
  constructor(private readonly commandService: CmsDisplayCommandService) {}

  private _userId(req: any): string {
    return req.user?.id ?? req.user?.sub ?? 'unknown';
  }

  @Post(':displayId')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  issue(@Param('displayId') displayId: string, @Body('commandType') commandType: CmsCommandType, @Request() req: any) {
    return this.commandService.issue(displayId, commandType, this._userId(req));
  }

  @Post('bulk-by-tags')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  issueByTags(@Body() body: { tags: string[]; commandType: CmsCommandType }, @Request() req: any) {
    return this.commandService.issueByTags(body.tags, body.commandType, this._userId(req));
  }

  @Get(':displayId/history')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  listHistory(@Param('displayId') displayId: string) {
    return this.commandService.listHistory(displayId);
  }
}
