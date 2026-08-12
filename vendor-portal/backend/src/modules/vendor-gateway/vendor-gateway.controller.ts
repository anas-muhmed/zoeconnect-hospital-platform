import { Controller, Get, Post, Param, Body, UseGuards, HttpException, HttpStatus, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VendorGatewayService } from './vendor-gateway.service';

@Controller('hospitals/:id/admin')
@UseGuards(JwtAuthGuard)
export class GlobalAdminController {
  constructor(private readonly gateway: VendorGatewayService) {}

  @Get('security/locked-users')
  async getLockedUsers(@Param('id') hospitalId: string) {
    const res = await this.gateway.executeQuery(hospitalId, '/api/v1/vendor/query/security/locked-users');
    if (!res.ok) throw new HttpException(res.error || 'Gateway query failed', HttpStatus.BAD_GATEWAY);
    return res.data;
  }

  @Post('security/users/actions/create')
  async createUser(
    @Param('id') hospitalId: string,
    @Body() payload: any
  ) {
    const res = await this.gateway.executeCommand(hospitalId, '/api/v1/vendor/command/security/users/actions/create', payload);
    if (!res.ok) throw new HttpException(res.error || 'Gateway command failed', HttpStatus.BAD_GATEWAY);
    return res;
  }

  @Post('security/users/:userId/actions/unlock')
  async unlockUser(
    @Param('id') hospitalId: string,
    @Param('userId') userId: string,
    @Body() payload: any
  ) {
    const res = await this.gateway.executeCommand(hospitalId, `/api/v1/vendor/command/security/users/${userId}/actions/unlock`, payload);
    if (!res.ok) throw new HttpException(res.error || 'Gateway command failed', HttpStatus.BAD_GATEWAY);
    return res;
  }

  @Post('security/users/:userId/actions/reset-attempts')
  async resetAttempts(
    @Param('id') hospitalId: string,
    @Param('userId') userId: string,
    @Body() payload: any
  ) {
    const res = await this.gateway.executeCommand(hospitalId, `/api/v1/vendor/command/security/users/${userId}/actions/reset-attempts`, payload);
    if (!res.ok) throw new HttpException(res.error || 'Gateway command failed', HttpStatus.BAD_GATEWAY);
    return res;
  }

  @Get('password-reset-requests')
  async getPasswordResetRequests(@Param('id') hospitalId: string) {
    return this.gateway.getPasswordResetRequests(hospitalId);
  }

  @Post('password-reset-requests/:reqId/approve')
  async approvePasswordResetRequest(
    @Param('id') hospitalId: string,
    @Param('reqId') reqId: string,
    @Body() payload: { note: string },
    @Request() req: any,
  ) {
    return this.gateway.approvePasswordResetRequest(hospitalId, reqId, payload.note, req.user.id);
  }

  @Post('password-reset-requests/:reqId/reject')
  async rejectPasswordResetRequest(
    @Param('id') hospitalId: string,
    @Param('reqId') reqId: string,
    @Body() payload: { reason: string },
    @Request() req: any,
  ) {
    return this.gateway.rejectPasswordResetRequest(hospitalId, reqId, payload.reason, req.user.id);
  }

  @Post('security/users/bulk-unlock')
  async bulkUnlock(
    @Param('id') hospitalId: string,
    @Body() body: { userIds: string[]; payload: any }
  ) {
    // Basic iterative bulk unlock (for a true scalable version, a dedicated bulk endpoint could be added to ZoeConnect)
    const results: any[] = [];
    for (const userId of body.userIds) {
      const res = await this.gateway.executeCommand(hospitalId, `/api/v1/vendor/command/security/users/${userId}/actions/unlock`, body.payload);
      results.push({ userId, success: res.ok, error: res.error, commandId: res.commandId });
    }
    return { results };
  }

  @Get('system/health')
  async getSystemHealth(@Param('id') hospitalId: string) {
    const res = await this.gateway.executeQuery(hospitalId, '/api/v1/vendor/query/system/health');
    if (!res.ok) throw new HttpException(res.error || 'Gateway query failed', HttpStatus.BAD_GATEWAY);
    return res.data;
  }

  @Get('system/info')
  async getSystemInfo(@Param('id') hospitalId: string) {
    const res = await this.gateway.executeQuery(hospitalId, '/api/v1/vendor/query/system/info');
    if (!res.ok) throw new HttpException(res.error || 'Gateway query failed', HttpStatus.BAD_GATEWAY);
    return res.data;
  }

  /**
   * Children's Village "standalone vs HIS-connected" control -- see
   * VendorGatewayService.getChildrensVillageProvider()'s doc comment.
   * Returns { mode: 'internal' | 'oracle_his' }.
   */
  @Get('modules/childrens-village/provider')
  async getChildrensVillageProvider(@Param('id') hospitalId: string) {
    const res = await this.gateway.getChildrensVillageProvider(hospitalId);
    if (!res.ok) throw new HttpException(res.error || 'Gateway query failed', HttpStatus.BAD_GATEWAY);
    return res.data;
  }

  @Post('modules/childrens-village/provider')
  async setChildrensVillageProvider(
    @Param('id') hospitalId: string,
    @Body() body: { mode: 'internal' | 'oracle_his' },
  ) {
    const res = await this.gateway.setChildrensVillageProvider(hospitalId, body.mode);
    if (!res.ok) throw new HttpException(res.error || 'Gateway command failed', HttpStatus.BAD_GATEWAY);
    return res.data;
  }
}

