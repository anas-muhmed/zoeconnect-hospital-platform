import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId }     from '../../../common/decorators/active-branch.decorator';
import { CmsDisplayGroupService } from './cms-display-group.service';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

interface CreateGroupDto { name: string; playlistId?: string | null; }
interface UpdateGroupDto { name?: string; playlistId?: string | null; }

@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('cms/display-groups')
export class CmsDisplayGroupController {
  constructor(private readonly groupService: CmsDisplayGroupService) {}

  private _userId(req: any): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return req.user?.id ?? req.user?.sub ?? 'unknown';
  }

  @Get()
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  list(@ActiveBranchId() branchId: string) {
    return this.groupService.list(branchId);
  }

  @Get(':id')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  findOne(@Param('id') id: string) {
    return this.groupService.findOne(id);
  }

  @Get(':id/members')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  members(@Param('id') id: string) {
    return this.groupService.listMembers(id);
  }

  @Post()
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  create(@Body() dto: CreateGroupDto, @Request() req: any, @ActiveBranchId() branchId: string | null) {
    return this.groupService.create({ ...dto, branchId, createdBy: this._userId(req) });
  }

  @Patch(':id')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  update(@Param('id') id: string, @Body() dto: UpdateGroupDto, @Request() req: any) {
    return this.groupService.update(id, dto, this._userId(req));
  }

  @Delete(':id')
  @RequirePermissions('CMS:DISPLAY:MANAGE')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.groupService.remove(id, this._userId(req));
  }
}
