import {
  Controller, Get, Post, Patch, Param, Body,
  UseGuards, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { FormsRuntimeService } from './forms-runtime.service';
import { CreateFormInstanceDto } from './dto/create-form-instance.dto';
import { SaveAnswersDto } from './dto/save-answers.dto';
import { FinalizeInstanceDto } from './dto/finalize-instance.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Audit } from '../../../common/decorators/audit.decorator';
import type { User } from '../../users/entities/user.entity';

/**
 * Runtime API (ADR-015) — the fill/submit/PDF surface for clinicians.
 * All routes live under `forms/runtime/...`, separate from the Designer API
 * (`forms/designer/...`, FormsDesignerController), per Phase 5A §1.6's
 * caching/rate-limiting/RBAC split between the two namespaces.
 *
 * Controller is deliberately thin (ADR-015, Phase 4B §1): HTTP concerns
 * only (routing, guards, serialization). All business logic lives in
 * FormsRuntimeService; all persistence in DocumentService +
 * DocumentInstanceService; PDF in PdfEngineService. No controller method
 * exceeds a single service delegation call + return.
 */
@ApiTags('Forms Runtime')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('forms/runtime')
export class FormsRuntimeController {
  constructor(private readonly formsRuntimeService: FormsRuntimeService) {}

  /**
   * Fetches the resolved published schema for a form template. Used by the
   * Renderer to mount the correct RendererComponents (ADR-003/ADR-007).
   * In Milestone 4, the six-stage pipeline's Resolver/Rule/Permission/Theme
   * stages are pass-throughs — this returns the published schema directly.
   */
  @Get('documents/:id/schema')
  @RequirePermissions('FORMS:RUNTIME:READ')
  @ApiOperation({
    summary: 'Get the resolved published schema for a form template (ADR-007 pipeline — stages stubbed until M5)',
  })
  getPublishedSchema(@Param('id') id: string) {
    return this.formsRuntimeService.getPublishedSchema(id);
  }

  /**
   * Creates a new fill instance for a published form version.
   * The instance starts in 'in_progress' status with empty answers.
   */
  @Post('documents/:id/instances')
  @RequirePermissions('FORMS:RUNTIME:CREATE')
  @Audit({ action: 'CREATE_FORM_INSTANCE', module: 'FORMS' })
  @ApiOperation({
    summary: 'Start a new fill instance for a published form version',
  })
  createInstance(
    @Param('id') id: string,
    @Body() dto: CreateFormInstanceDto,
    @CurrentUser() actor: User,
  ) {
    return this.formsRuntimeService.createInstance(id, {
      branchId: dto.branchId ?? null,
      departmentCode: dto.departmentCode ?? null,
      patientId: dto.patientId ?? null,
      visitId: dto.visitId ?? null,
      encounterId: dto.encounterId ?? null,
    });
  }

  /**
   * Fetches a fill instance by id (answers + status).
   * Used by the Renderer for resuming a draft fill (autosave recovery).
   */
  @Get('instances/:instanceId')
  @RequirePermissions('FORMS:RUNTIME:READ')
  @ApiOperation({ summary: 'Get a fill instance (answers + status)' })
  getInstance(@Param('instanceId') instanceId: string) {
    return this.formsRuntimeService.getInstance(instanceId);
  }

  /**
   * Saves partial or full answers for an in-progress instance (autosave).
   * Answers are merged — existing keys are overwritten, absent keys preserved.
   * Rejected once the instance is finalized (per ADR-001's immutability pattern).
   */
  @Patch('instances/:instanceId/answers')
  @RequirePermissions('FORMS:RUNTIME:UPDATE')
  @Audit({ action: 'AUTOSAVE_FORM_ANSWERS', module: 'FORMS' })
  @ApiOperation({
    summary: 'Autosave answers for an in-progress instance (merge, not replace)',
  })
  saveAnswers(
    @Param('instanceId') instanceId: string,
    @Body() dto: SaveAnswersDto,
  ) {
    return this.formsRuntimeService.saveAnswers(instanceId, dto.answers, dto.version);
  }

  /**
   * Submits and finalizes a fill instance.
   *
   * Server-side re-validates ALL answers against the published FormSchema
   * before allowing the status transition to 'finalized' (ADR-012 — the
   * client-side validation in the Renderer is a UX convenience, never the
   * authoritative check). Returns 400 with field-level error details on
   * validation failure.
   */
  @Post('instances/:instanceId/finalize')
  @RequirePermissions('FORMS:RUNTIME:FINALIZE')
  @Audit({ action: 'FINALIZE_FORM_INSTANCE', module: 'FORMS' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit and finalize a fill instance (ADR-012 server-side re-validation)',
  })
  finalizeInstance(
    @Param('instanceId') instanceId: string,
    @Body() dto: FinalizeInstanceDto,
    @CurrentUser() actor: User,
  ) {
    return this.formsRuntimeService.finalizeInstance(instanceId, actor.id, dto.version);
  }

  /**
   * Generates and streams a PDF of a finalized form submission.
   *
   * Only finalized instances are eligible — a partially-filled instance
   * may carry invalid/incomplete answers. PDF generation delegates to the
   * Document Engine's PdfEngineService (ADR-002: PDF generation is a
   * Document Platform responsibility, not a forms-specific one).
   *
   * Returns application/pdf with Content-Disposition: attachment.
   */
  @Get('instances/:instanceId/pdf')
  @RequirePermissions('FORMS:RUNTIME:READ')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Generate a PDF of a finalized form submission (Milestone 4 exit criterion — ADR-002 Phase 4A §2.1)',
  })
  async generatePdf(
    @Param('instanceId') instanceId: string,
    @Res() reply: FastifyReply,
  ) {
    const buffer = await this.formsRuntimeService.generateInstancePdf(instanceId);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="form-instance-${instanceId}.pdf"`)
      .header('Content-Length', buffer.byteLength)
      .send(buffer);
  }
}
