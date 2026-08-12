import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';

import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

import { WorkstationService } from './workstation.service';
import { SaveWorkstationConfigDto, SetWorkstationLockDto } from './dto/save-workstation-config.dto';

/**
 * WorkstationController
 *
 * Base path: /token/workstation
 *
 * Almost everything here is @Public() by design: a fresh workstation has no
 * ZoeConnect login of any kind (that's the whole point of this architecture --
 * see docs/his-integration/POPUP_INTEGRATION_ARCHITECTURE.md). The
 * workstationId itself is not a secret; it's a client-generated
 * correlation key. What it unlocks is scoped to reading queue-relevant
 * picker options and this one workstation's own branch/location/counter --
 * nothing a receptionist couldn't already see on the physical HIS screen.
 *
 * The two exceptions (`/override`, `/lock`) require a normal, permission-
 * guarded ZoeConnect session -- reusing the exact same guard stack and
 * permission name (TOKEN:REGISTRATION:SUPERVISOR_RESET) already used for
 * registration.controller.ts's supervisor-reset endpoint, rather than
 * inventing a parallel concept.
 */
@Controller('token/workstation')
export class WorkstationController {
  constructor(private readonly svc: WorkstationService) {}

  // ── Picker options ────────────────────────────────────────────────────────

  @Public()
  @Get('options/branches')
  listBranches() {
    return this.svc.listBranches();
  }

  @Public()
  @Get('options/locations')
  listLocations(@Query('branchId') branchId: string) {
    return this.svc.listLocations(branchId);
  }

  @Public()
  @Get('options/counters')
  listCounters(@Query('locationId') locationId: string) {
    return this.svc.listCounters(locationId);
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  /**
   * GET /token/workstation/:workstationId
   * Called by the popup on every open. `{ configured: false }` means "show
   * the setup picker"; otherwise returns the resolved display config plus a
   * fresh workstation session token.
   */
  @Public()
  @Get(':workstationId')
  bootstrap(@Param('workstationId') workstationId: string) {
    return this.svc.bootstrap(workstationId);
  }

  // ── Save / reconfigure ───────────────────────────────────────────────────

  /**
   * POST /token/workstation/:workstationId
   * Walk-up configuration -- no login required. Refused with
   * WORKSTATION_LOCKED if this workstation has been locked by a
   * supervisor; use /override in that case.
   */
  @Public()
  @Post(':workstationId')
  saveConfig(
    @Param('workstationId') workstationId: string,
    @Body() dto: SaveWorkstationConfigDto,
  ) {
    const actorLabel = dto.configuredByLabel?.trim() || 'walk-up';
    return this.svc.saveConfig(workstationId, dto, actorLabel, false);
  }

  /**
   * POST /token/workstation/:workstationId/override
   * Supervisor path -- always allowed regardless of the locked flag.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('TOKEN:REGISTRATION:SUPERVISOR_RESET')
  @Post(':workstationId/override')
  overrideConfig(
    @Param('workstationId') workstationId: string,
    @Body() dto: SaveWorkstationConfigDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.saveConfig(workstationId, dto, user.username ?? user.id, true);
  }

  /**
   * PATCH /token/workstation/:workstationId/lock
   * Body: { locked: boolean }
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('TOKEN:REGISTRATION:SUPERVISOR_RESET')
  @Patch(':workstationId/lock')
  setLocked(
    @Param('workstationId') workstationId: string,
    @Body() dto: SetWorkstationLockDto,
  ) {
    return this.svc.setLocked(workstationId, dto.locked);
  }
}
