import {
  Controller, Get, Put, Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiParam,
} from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';
import { BranchService } from './branch.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '../users/entities/user.entity';

export class AssignBranchesDto {
  @IsArray()
  @IsString({ each: true })
  branchIds: string[] = [];
}

@ApiTags('Branches')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('branches')
export class BranchController {
  constructor(private readonly branchSvc: BranchService) {}

  // ── GET /api/v1/branches  — list all from Oracle (superadmin) ─────────────
  @Get()
  @RequirePermissions('PLATFORM:BRANCH:READ')
  @ApiOperation({ summary: 'List all branches from Oracle HIS (superadmin)' })
  listAll() {
    return this.branchSvc.findAll();
  }

  // ── GET /api/v1/branches/my  — current user's branches ───────────────────
  @Get('my')
  @ApiOperation({ summary: "Current user's assigned branches" })
  myBranches(@CurrentUser() user: User) {
    return this.branchSvc.getUserBranches(user.id);
  }

  // ── GET /api/v1/branches/user/:userId ─────────────────────────────────────
  @Get('user/:userId')
  @RequirePermissions('PLATFORM:BRANCH:READ')
  @ApiOperation({ summary: "Get branches assigned to a specific user" })
  @ApiParam({ name: 'userId', type: String })
  getUserBranches(@Param('userId') userId: string) {
    return this.branchSvc.getUserBranches(userId);
  }

  // ── PUT /api/v1/branches/user/:userId  — assign branches ─────────────────
  @Put('user/:userId')
  @RequirePermissions('PLATFORM:BRANCH:MANAGE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign branches to a user (replaces existing)' })
  @ApiParam({ name: 'userId', type: String })
  assignBranches(
    @Param('userId') userId: string,
    @Body() dto: AssignBranchesDto,
    @CurrentUser() actor: User,
  ) {
    return this.branchSvc.assignBranches(userId, dto.branchIds, actor.id);
  }

  // ── POST /api/v1/branches/cache/invalidate — manual cache bust ────────────
  @Put('cache/invalidate')
  @RequirePermissions('PLATFORM:BRANCH:MANAGE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate the cached branch list (forces re-fetch from Oracle)' })
  invalidateCache() {
    return this.branchSvc.invalidateCache();
  }
}
