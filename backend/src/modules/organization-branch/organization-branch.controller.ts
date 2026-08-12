import {
  Controller, Get, Post, Patch, Param, Body, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiResponse,
} from '@nestjs/swagger';
import { OrganizationBranchService } from './organization-branch.service';
import { CreateOrganizationBranchDto } from './dto/create-organization-branch.dto';
import { UpdateOrganizationBranchDto } from './dto/update-organization-branch.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '../users/entities/user.entity';

/**
 * ZoeConnect Identity Architecture Migration, Phase 1 -- REST surface for the
 * new "Organization Branch" concept (see organization-branch.entity.ts's doc
 * comment). Every route is scoped to the authenticated caller's own
 * `tenantId` -- there is no cross-tenant listing/management here, matching
 * this codebase's existing tenant-isolation posture.
 */
@ApiTags('Organization Branches')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('organization-branches')
export class OrganizationBranchController {
  constructor(private readonly orgBranchService: OrganizationBranchService) {}

  // ── GET /api/v1/organization-branches ───────────────────────────────────
  @Get()
  @RequirePermissions('PLATFORM:ORG_BRANCHES:READ')
  @ApiOperation({ summary: "List the caller's tenant's organization branches" })
  listForTenant(@CurrentUser() user: User) {
    return this.orgBranchService.listForTenant(user.tenantId);
  }

  // ── GET /api/v1/organization-branches/default ───────────────────────────
  @Get('default')
  @RequirePermissions('PLATFORM:ORG_BRANCHES:READ')
  @ApiOperation({ summary: "Get the caller's tenant's default organization branch" })
  getDefault(@CurrentUser() user: User) {
    return this.orgBranchService.getDefault(user.tenantId);
  }

  // ── GET /api/v1/organization-branches/:id ───────────────────────────────
  @Get(':id')
  @RequirePermissions('PLATFORM:ORG_BRANCHES:READ')
  @ApiOperation({ summary: 'Get a single organization branch by ID (must belong to the caller\'s tenant)' })
  @ApiResponse({ status: 404, description: 'Not found (or belongs to a different tenant)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.orgBranchService.findOne(user.tenantId, id);
  }

  // ── POST /api/v1/organization-branches ──────────────────────────────────
  @Post()
  @RequirePermissions('PLATFORM:ORG_BRANCHES:CREATE')
  @ApiOperation({ summary: 'Create a new organization branch for the caller\'s tenant' })
  @ApiResponse({ status: 409, description: 'A branch with that code already exists for this tenant' })
  create(@Body() dto: CreateOrganizationBranchDto, @CurrentUser() user: User) {
    return this.orgBranchService.create(user.tenantId, dto);
  }

  // ── PATCH /api/v1/organization-branches/:id ─────────────────────────────
  @Patch(':id')
  @RequirePermissions('PLATFORM:ORG_BRANCHES:UPDATE')
  @ApiOperation({ summary: 'Update an organization branch (name/status/default flag)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationBranchDto,
    @CurrentUser() user: User,
  ) {
    return this.orgBranchService.update(user.tenantId, id, dto);
  }
}
