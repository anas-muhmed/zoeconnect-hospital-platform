import {
  Controller, Get, Post, Patch, Delete, Param, Body, Request, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CmsScheduleService, ScheduleInput } from './cms-schedule.service';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('cms')
export class CmsScheduleController {
  constructor(private readonly scheduleService: CmsScheduleService) {}

  private _userId(req: any): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return req.user?.id ?? req.user?.sub ?? 'unknown';
  }

  @Get('displays/:displayId/schedules')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  list(@Param('displayId') displayId: string) {
    return this.scheduleService.listForDisplay(displayId);
  }

  @Post('displays/:displayId/schedules')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  create(@Param('displayId') displayId: string, @Body() dto: ScheduleInput, @Request() req: any) {
    return this.scheduleService.create(displayId, dto, this._userId(req));
  }

  @Patch('schedules/:id')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  update(@Param('id') id: string, @Body() dto: Partial<ScheduleInput>, @Request() req: any) {
    return this.scheduleService.update(id, dto, this._userId(req));
  }

  @Delete('schedules/:id')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.scheduleService.remove(id, this._userId(req));
  }
}
