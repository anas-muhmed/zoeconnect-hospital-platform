import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { DrugRequestsService } from '../services/drug-requests.service';
import { buildDrugIndentingContext } from '../drug-indenting-request-context';
import {
  SubmitDrugRequestDto, SubmitPharmacistDrugRequestDto, SubmitEmergencyDrugRequestDto,
} from '../dto/submit-drug-request.dto';
import {
  ApproveDrugRequestDto, RejectDrugRequestDto, InitialReviewApproveDto,
  UpdateDrugInfoDto, RevertDrugRequestDto, MarkInventoryAddedDto,
} from '../dto/workflow-action.dto';
import { ResubmitCorrectionDto } from '../dto/resubmit-correction.dto';


/**
 * Drug Indenting integration (delivery phase). Ports `routes/requests.js`.
 * Stage-specific authorization (only the role responsible for a request's
 * CURRENT stage may approve/reject/review it) is enforced inside
 * `DrugRequestsService` via `DrugIndentingRequestContext` — every workflow
 * role here is granted the same broad `REQUESTS:APPROVE`/`REQUESTS:REJECT`
 * permission, same reasoning as Mortuary's admin-override flags living in
 * the service rather than the route guard.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('drug-indenting/requests')
export class DrugRequestsController {
  constructor(private readonly requestsService: DrugRequestsService) {}

  @Post()
  @RequirePermissions('DRUG_INDENTING:REQUESTS:CREATE')
  submit(@CurrentUser() user: User, @Body() dto: SubmitDrugRequestDto) {
    return this.requestsService.submit(buildDrugIndentingContext(user), dto);
  }

  @Post('pharmacist')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:CREATE', 'DRUG_INDENTING:WORKFLOW:ACT_AS_PHARMACIST')
  submitPharmacistDirect(@CurrentUser() user: User, @Body() dto: SubmitPharmacistDrugRequestDto) {
    return this.requestsService.submitPharmacistDirect(buildDrugIndentingContext(user), dto);
  }

  @Post('emergency')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:EMERGENCY_CREATE')
  submitEmergency(@CurrentUser() user: User, @Body() dto: SubmitEmergencyDrugRequestDto) {
    return this.requestsService.submitEmergency(buildDrugIndentingContext(user), dto);
  }

  @Get(':role')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:VIEW')
  listForRole(
    @CurrentUser() user: User,
    @Param('role') role: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('sourceType') sourceType?: string,
    @Query('formularyType') formularyType?: string,
  ) {
    return this.requestsService.listForRole(buildDrugIndentingContext(user), role, {
      status, category, fromDate, toDate, sourceType, formularyType,
    });
  }

  @Put(':id/approve')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:APPROVE')
  approve(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveDrugRequestDto) {
    return this.requestsService.approve(buildDrugIndentingContext(user), id, dto);
  }

  @Put(':id/reject')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:REJECT')
  reject(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDrugRequestDto) {
    return this.requestsService.reject(buildDrugIndentingContext(user), id, dto);
  }

  @Put(':id/initial-review-approve')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:APPROVE', 'DRUG_INDENTING:WORKFLOW:ACT_AS_PHARMACIST')
  initialReviewApprove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InitialReviewApproveDto) {
    return this.requestsService.initialReviewApprove(buildDrugIndentingContext(user), id, dto);
  }

  @Put(':id/drug-info')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:CORRECT')
  updateDrugInfo(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDrugInfoDto) {
    return this.requestsService.updateDrugInfo(buildDrugIndentingContext(user), id, dto);
  }

  @Post(':id/place-order')
  @RequirePermissions('DRUG_INDENTING:ORDER:PLACE')
  placeOrder(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.requestsService.placeOrder(buildDrugIndentingContext(user), id);
  }

  @Put(':id/mark-inventory-added')
  @RequirePermissions('DRUG_INDENTING:INVENTORY:MANAGE')
  markInventoryAdded(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkInventoryAddedDto) {
    return this.requestsService.markInventoryAdded(buildDrugIndentingContext(user), id, dto);
  }

  @Post(':id/mark-inventory-received')
  @RequirePermissions('DRUG_INDENTING:INVENTORY:MANAGE')
  markInventoryReceived(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.requestsService.markInventoryReceived(buildDrugIndentingContext(user), id);
  }

  @Put(':id/revert-to-pharmacist')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:REVERT', 'DRUG_INDENTING:WORKFLOW:ACT_AS_PHARMACY_HEAD')
  revertToPharmacist(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevertDrugRequestDto) {
    return this.requestsService.revertToPharmacist(buildDrugIndentingContext(user), id, dto);
  }

  @Put(':id/revert-to-pharmacy-head')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:REVERT', 'DRUG_INDENTING:WORKFLOW:ACT_AS_DTC_COMMITTEE')
  revertToPharmacyHead(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevertDrugRequestDto) {
    return this.requestsService.revertToPharmacyHead(buildDrugIndentingContext(user), id, dto);
  }

  @Put(':id/resubmit-correction')
  @RequirePermissions('DRUG_INDENTING:REQUESTS:CORRECT', 'DRUG_INDENTING:WORKFLOW:ACT_AS_PHARMACIST')
  resubmitCorrection(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResubmitCorrectionDto) {
    return this.requestsService.resubmitCorrection(buildDrugIndentingContext(user), id, dto);
  }

  @Post(':id/alternatives')
  @RequirePermissions('DRUG_INDENTING:ALTERNATIVES:MANAGE', 'DRUG_INDENTING:WORKFLOW:ACT_AS_PHARMACIST')
  submitAlternatives(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResubmitCorrectionDto) {
    return this.requestsService.submitAlternatives(buildDrugIndentingContext(user), id, dto);
  }
}
