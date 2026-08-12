import {
  Controller, Get, Post, Patch, Delete, Param, Body, Request, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { KioskAdminService } from './kiosk-admin.service';
import { CreateKioskPairingDto } from './dto/create-kiosk-pairing.dto';

/**
 * Admin surface for Kiosk Desktop devices: generate activation codes,
 * list registered tills with live online/offline status, disable/revoke.
 * Reuses the existing 'TOKEN:KIOSK:MANAGE' permission (same one
 * TokenKioskController's admin routes already require) rather than
 * introducing a new permission string, which would additionally need a
 * permissions-table migration + role grants (see
 * 1783480000000-AddRegistrationViewActionPermissions.ts for that
 * pattern) -- kiosk tills are the same "who can administer kiosks"
 * responsibility as the existing display-board kiosk config.
 */
@ApiTags('Kiosk Device Admin')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('QUEUE')
@RequirePermissions('TOKEN:KIOSK:MANAGE')
@Controller('kiosk-devices')
export class KioskAdminController {
  constructor(private readonly adminService: KioskAdminService) {}

  @Post('pairings')
  createPairing(@Body() dto: CreateKioskPairingDto, @Request() req: { user: { id: string; tenantId: string } }) {
    return this.adminService.createPairing(req.user.tenantId, dto, req.user.id);
  }

  @Get('pairings')
  listPairings(@Request() req: { user: { tenantId: string } }) {
    return this.adminService.listPairings(req.user.tenantId);
  }

  @Delete('pairings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokePairing(@Param('id') id: string, @Request() req: { user: { tenantId: string } }) {
    await this.adminService.revokePairing(req.user.tenantId, id);
  }

  @Get()
  listDevices(@Request() req: { user: { tenantId: string } }) {
    return this.adminService.listDevices(req.user.tenantId);
  }

  @Patch(':id/disable')
  disableDevice(@Param('id') id: string, @Request() req: { user: { tenantId: string } }) {
    return this.adminService.disableDevice(req.user.tenantId, id);
  }

  @Patch(':id/enable')
  enableDevice(@Param('id') id: string, @Request() req: { user: { tenantId: string } }) {
    return this.adminService.enableDevice(req.user.tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeDevice(@Param('id') id: string, @Request() req: { user: { tenantId: string } }) {
    await this.adminService.revokeDevice(req.user.tenantId, id);
  }
}
