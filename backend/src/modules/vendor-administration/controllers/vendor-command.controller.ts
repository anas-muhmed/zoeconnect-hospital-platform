import { Controller, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { VendorHmacGuard } from '../guards/vendor-hmac.guard';
import { CommandDispatcherService } from '../services/command-dispatcher.service';

@Controller('vendor/command')
@UseGuards(VendorHmacGuard)
export class VendorCommandController {
  constructor(private readonly dispatcher: CommandDispatcherService) {}

  @Post('security/users/actions/create')
  async createUser(
    @Body() body: any,
    @Req() req: FastifyRequest,
  ) {
    return this.dispatcher.dispatch({
      action: 'security:users:create',
      vendorContext: (req as any).vendorContext,
      payload: body,
    });
  }

  @Post('security/users/:id/actions/unlock')
  async unlockUser(
    @Param('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ) {
    return this.dispatcher.dispatch({
      action: 'security:users:unlock',
      targetId: userId,
      vendorContext: (req as any).vendorContext,
      payload: body,
    });
  }

  @Post('security/users/:id/actions/reset-attempts')
  async resetAttempts(
    @Param('id') userId: string,
    @Body() body: any,
    @Req() req: FastifyRequest,
  ) {
    return this.dispatcher.dispatch({
      action: 'security:users:reset-attempts',
      targetId: userId,
      vendorContext: (req as any).vendorContext,
      payload: body,
    });
  }

  @Post('security/users/:id/actions/reset-password')
  async resetPassword(
    @Param('id') userId: string,
    @Body() body: { vendorRequestId: string; reason?: string },
    @Req() req: FastifyRequest,
  ) {
    return this.dispatcher.dispatch({
      action: 'security:users:reset-password',
      targetId: userId,
      vendorContext: (req as any).vendorContext,
      payload: body,
    });
  }

  /**
   * Sets whether Children's Village sources student demographics from its
   * own standalone `cv_students` table ('internal') or from the hospital's
   * Oracle HIS ('oracle_his'). See childrens-village/adr/0001 and 0002 --
   * the ADRs that call for exactly this control to live in the Vendor
   * Portal's provisioning/configuration process.
   */
  @Post('modules/childrens-village/actions/set-provider')
  async setChildrensVillageProvider(
    @Body() body: { mode: 'internal' | 'oracle_his' },
    @Req() req: FastifyRequest,
  ) {
    return this.dispatcher.dispatch({
      action: 'modules:childrens-village:set-provider',
      vendorContext: (req as any).vendorContext,
      payload: body,
    });
  }
}
