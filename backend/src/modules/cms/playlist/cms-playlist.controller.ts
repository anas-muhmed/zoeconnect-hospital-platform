import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Request, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard }       from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId }     from '../../../common/decorators/active-branch.decorator';
import { CmsPlaylistService, ItemSettingsInput } from './cms-playlist.service';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';

interface CreatePlaylistDto { name: string; description?: string | null; }
interface UpdatePlaylistDto { name?: string; description?: string | null; }
interface AddItemDto extends ItemSettingsInput { mediaId: string; }
interface AddWidgetItemDto { widgetType: string; configuration: Record<string, unknown>; durationSeconds?: number | null; enabled?: boolean; }
interface ReorderDto { orderedItemIds: string[]; }

@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('cms/playlists')
export class CmsPlaylistController {
  constructor(private readonly playlistService: CmsPlaylistService) {}

  private _userId(req: any): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return req.user?.id ?? req.user?.sub ?? 'unknown';
  }

  @Get()
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  list(@ActiveBranchId() branchId: string) {
    return this.playlistService.list(branchId);
  }

  @Get(':id')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  findOne(@Param('id') id: string) {
    return this.playlistService.findOne(id);
  }

  @Post()
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  create(@Body() dto: CreatePlaylistDto, @Request() req: any, @ActiveBranchId() branchId: string | null) {
    return this.playlistService.create({ ...dto, branchId, createdBy: this._userId(req) });
  }

  @Patch(':id')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  update(@Param('id') id: string, @Body() dto: UpdatePlaylistDto, @Request() req: any) {
    return this.playlistService.update(id, { ...dto, updatedBy: this._userId(req) });
  }

  @Delete(':id')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  archive(@Param('id') id: string) {
    return this.playlistService.archive(id);
  }

  @Post(':id/duplicate')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  duplicate(@Param('id') id: string, @Request() req: any) {
    return this.playlistService.duplicate(id, this._userId(req));
  }

  // -- Items ------------------------------------------------------------------

  @Get(':id/items')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  listItems(@Param('id') id: string) {
    return this.playlistService.listItems(id);
  }

  @Post(':id/items')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  addItem(@Param('id') id: string, @Body() dto: AddItemDto) {
    return this.playlistService.addItem(id, dto);
  }

  /** Phase 5: adds a widget item (e.g. Queue Widget) -- not backed by an uploaded media file. */
  @Post(':id/widget-items')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  addWidgetItem(@Param('id') id: string, @Body() dto: AddWidgetItemDto) {
    return this.playlistService.addWidgetItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: ItemSettingsInput & { configuration?: Record<string, unknown> }) {
    return this.playlistService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.playlistService.removeItem(id, itemId);
  }

  @Post(':id/items/reorder')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  reorder(@Param('id') id: string, @Body() dto: ReorderDto) {
    return this.playlistService.reorderItems(id, dto.orderedItemIds);
  }

  // -- Publish / preview --------------------------------------------------------

  @Get(':id/preview')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  preview(@Param('id') id: string) {
    return this.playlistService.preview(id);
  }

  @Post(':id/publish')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  publish(@Param('id') id: string, @Request() req: any) {
    return this.playlistService.publish(id, this._userId(req));
  }

  // -- Version history / rollback ------------------------------------------------

  @Get(':id/versions')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  listVersions(@Param('id') id: string) {
    return this.playlistService.listVersions(id);
  }

  @Post(':id/versions/:versionId/rollback')
  @RequirePermissions('CMS:PLAYLIST:MANAGE')
  rollback(@Param('id') id: string, @Param('versionId') versionId: string, @Request() req: any) {
    return this.playlistService.rollback(id, versionId, this._userId(req));
  }
}
