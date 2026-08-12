import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { MortuaryHousekeepingService } from '../services/mortuary-housekeeping.service';
import { AssignHousekeepingTaskDto, HousekeepingTaskIdDto } from '../dto/housekeeping-task-action.dto';

/** Mortuary integration (Phase 2, Stage C). Ports `housekeepingController.js`. `@RequirePermissions()` deferred to Stage D — see Stage C report. */
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('mortuary/housekeeping')
export class MortuaryHousekeepingController {
  constructor(private readonly housekeepingService: MortuaryHousekeepingService) {}

  @Get('tasks')
  findAll(@CurrentUser() user: User) {
    return this.housekeepingService.findAll(user.tenantId);
  }

  @Post('assign')
  async assign(@CurrentUser() user: User, @Body() dto: AssignHousekeepingTaskDto) {
    await this.housekeepingService.assign(user.tenantId, dto.taskId, dto.staffName);
    return { message: 'Task assigned successfully' };
  }

  @Post('complete')
  async complete(@CurrentUser() user: User, @Body() dto: HousekeepingTaskIdDto) {
    await this.housekeepingService.complete(user.tenantId, dto.taskId);
    return { message: 'Task marked as completed' };
  }

  @Post('verify')
  async verify(@CurrentUser() user: User, @Body() dto: HousekeepingTaskIdDto) {
    await this.housekeepingService.verify(user.tenantId, dto.taskId);
    return { message: 'Task verified and cabin is now Available' };
  }
}
