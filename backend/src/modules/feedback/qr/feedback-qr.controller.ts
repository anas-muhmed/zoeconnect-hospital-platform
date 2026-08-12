import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, UseInterceptors, ParseUUIDPipe, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import type { User } from '../../users/entities/user.entity';
import { FeedbackQrService } from './feedback-qr.service';
import { CreateQrCodeDto, UpdateQrCodeDto } from '../dto/feedback-qr.dto';

/**
 * Admin-only QR code management: generate, list (optionally filtered by
 * campaign for a print layout), regenerate (rotate token), disable, delete,
 * and download as SVG/PNG. The actual public resolution/submission
 * endpoints live in FeedbackPublicController, unauthenticated.
 */
@ApiTags('Feedback QR Codes')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/qr-codes')
export class FeedbackQrController {
  constructor(private readonly qrService: FeedbackQrService) {}

  @Get()
  @RequirePermissions('FEEDBACK:QR:VIEW')
  @ApiOperation({ summary: 'List QR codes, optionally filtered by campaign (for print layout)' })
  list(@ActiveBranchId() branchId: string, @Query('campaignId') campaignId?: string) {
    return this.qrService.list(branchId, campaignId);
  }

  @Get(':id')
  @RequirePermissions('FEEDBACK:QR:VIEW')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrService.findOne(id);
  }

  @Post()
  @RequirePermissions('FEEDBACK:QR:CREATE')
  @ApiOperation({ summary: 'Generate a new QR code for a campaign' })
  create(@Body() dto: CreateQrCodeDto, @CurrentUser() actor: User, @ActiveBranchId() branchId: string) {
    return this.qrService.create({ ...dto, branchId }, actor.id);
  }

  @Patch(':id')
  @RequirePermissions('FEEDBACK:QR:EDIT')
  @ApiOperation({ summary: 'Update label/target/active state/expiry' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQrCodeDto, @CurrentUser() actor: User) {
    return this.qrService.update(id, dto, actor.id);
  }

  @Post(':id/regenerate')
  @RequirePermissions('FEEDBACK:QR:EDIT')
  @ApiOperation({ summary: 'Rotate the token (old printed QR stops resolving)' })
  regenerate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.qrService.regenerate(id, actor.id);
  }

  @Delete(':id')
  @RequirePermissions('FEEDBACK:QR:DELETE')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.qrService.remove(id, actor.id);
  }

  @Get(':id/svg')
  @RequirePermissions('FEEDBACK:QR:VIEW')
  @Header('Content-Type', 'image/svg+xml')
  @ApiOperation({ summary: 'QR code as an SVG image, for printing' })
  svg(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrService.renderSvg(id);
  }

  @Get(':id/png')
  @RequirePermissions('FEEDBACK:QR:VIEW')
  @ApiOperation({ summary: 'QR code as a PNG data URL' })
  async png(@Param('id', ParseUUIDPipe) id: string) {
    return { dataUrl: await this.qrService.renderPngDataUrl(id) };
  }
}
