import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryHousekeepingService } from '../services/mortuary-housekeeping.service';
import { AssignHousekeepingTaskDto, HousekeepingTaskIdDto } from '../dto/housekeeping-task-action.dto';

/** Mortuary integration (Phase 2, Stage D). Ports `housekeepingController.js`. Permission matrix: see Stage D report §2/§3. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/housekeeping')
export class MortuaryHousekeepingController {
  constructor(private readonly housekeepingService: MortuaryHousekeepingService) {}

  @Get('tasks')
  @RequirePermissions('MORTUARY:HOUSEKEEPING:READ')
  findAll(@CurrentUser() user: User) {
    return this.housekeepingService.findAll(user.tenantId);
  }

  @Post('assign')
  @RequirePermissions('MORTUARY:HOUSEKEEPING:MANAGE')
  async assign(@CurrentUser() user: User, @Body() dto: AssignHousekeepingTaskDto) {
    await this.housekeepingService.assign(user.tenantId, dto.taskId, dto.staffName);
    return { message: 'Task assigned successfully' };
  }

  @Post('complete')
  @RequirePermissions('MORTUARY:HOUSEKEEPING:MANAGE')
  async complete(@CurrentUser() user: User, @Body() dto: HousekeepingTaskIdDto) {
    await this.housekeepingService.complete(user.tenantId, dto.taskId);
    return { message: 'Task marked as completed' };
  }

  @Post('verify')
  @RequirePermissions('MORTUARY:HOUSEKEEPING:MANAGE')
  async verify(@CurrentUser() user: User, @Body() dto: HousekeepingTaskIdDto) {
    await this.housekeepingService.verify(user.tenantId, dto.taskId);
    return { message: 'Task verified and cabin is now Available' };
  }
}
