import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { DocumentOverrideService } from '../document-engine/services/document-override.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FormsDesignerService } from './forms-designer.service';
import { CreateFormDocumentDto } from './dto/create-form-document.dto';
import { SaveFormVersionDto } from './dto/save-form-version.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Audit } from '../../../common/decorators/audit.decorator';
import type { User } from '../../users/entities/user.entity';

/**
 * Designer API (ADR-015) — draft-only template CRUD for the 'form' document
 * type, plus (Milestone 4) a minimal publish action. Deliberately under its
 * own route namespace (`forms/designer/...`) separate from the Runtime API
 * (`forms/runtime/...`, Milestone 4), per Phase 5A §hardening's Designer vs
 * Runtime API split.
 *
 * `publish` is intentionally minimal (see FormsDesignerService's docblock):
 * a single-step draft->published transition with no approval chain. The
 * real Configurable Workflow Engine (Milestone 5, ADR-008) will supersede
 * this endpoint's internals without changing its contract.
 */
@ApiTags('Forms Designer')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('forms/designer')
export class FormsDesignerController {
  constructor(
    private readonly formsDesignerService: FormsDesignerService,
    private readonly documentOverrideService: DocumentOverrideService
  ) {}

  @Post('documents')
  @RequirePermissions('FORMS:DESIGNER:CREATE')
  @Audit({ action: 'CREATE_FORM_TEMPLATE', module: 'FORMS' })
  @ApiOperation({ summary: 'Create a new form template (Document Engine document, documentTypeId=form)' })
  createDocument(@Body() dto: CreateFormDocumentDto, @CurrentUser() actor: User) {
    return this.formsDesignerService.createTemplate(dto, actor.id);
  }

  @Get('documents')
  @RequirePermissions('FORMS:DESIGNER:READ')
  @ApiOperation({ summary: 'List all form templates' })
  listDocuments(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const l = limit ? parseInt(limit, 10) : 50;
    const o = offset ? parseInt(offset, 10) : 0;
    return this.formsDesignerService.listTemplates(l, o);
  }

  @Get('documents/:id')
  @RequirePermissions('FORMS:DESIGNER:READ')
  @ApiOperation({ summary: 'Get a form template by document id' })
  getDocument(@Param('id') id: string) {
    return this.formsDesignerService.getTemplate(id);
  }

  @Post('documents/:id/versions')
  @RequirePermissions('FORMS:DESIGNER:CREATE')
  @Audit({ action: 'SAVE_FORM_DRAFT_VERSION', module: 'FORMS' })
  @ApiOperation({ summary: 'Save the Designer canvas as a new draft version (the "Save" step)' })
  createVersion(@Param('id') id: string, @Body() dto: SaveFormVersionDto, @CurrentUser() actor: User) {
    return this.formsDesignerService.saveDraftVersion(id, dto.schema, actor.id);
  }

  @Get('documents/:id/versions')
  @RequirePermissions('FORMS:DESIGNER:READ')
  @ApiOperation({ summary: 'List all versions of a form template' })
  listVersions(@Param('id') id: string) {
    return this.formsDesignerService.listVersions(id);
  }

  @Get('documents/:id/versions/:versionId')
  @RequirePermissions('FORMS:DESIGNER:READ')
  @ApiOperation({ summary: 'Fetch a specific version (the "Reload" step reads this back)' })
  getVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.formsDesignerService.getVersion(id, versionId);
  }

  @Patch('documents/:id/versions/:versionId')
  @RequirePermissions('FORMS:DESIGNER:UPDATE')
  @Audit({ action: 'UPDATE_FORM_DRAFT_VERSION', module: 'FORMS' })
  @ApiOperation({ summary: 'Update an existing draft version in place (rejected once non-draft, ADR-001)' })
  updateVersion(@Param('id') id: string, @Param('versionId') versionId: string, @Body() dto: SaveFormVersionDto) {
    return this.formsDesignerService.updateDraftVersion(id, versionId, dto.schema);
  }

  @Post('documents/:id/versions/:versionId/publish')
  @RequirePermissions('FORMS:DESIGNER:PUBLISH')
  @Audit({ action: 'PUBLISH_FORM_VERSION', module: 'FORMS' })
  @ApiOperation({ summary: 'Publish a draft version (Milestone 4 minimal stopgap — no approval chain; see ADR-008/Milestone 5)' })
  publishVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.formsDesignerService.publishVersion(id, versionId);
  }

  // Phase 5D: Overrides (ADR-011)
  @Post('documents/:id/overrides')
  @RequirePermissions('FORMS:DESIGNER:UPDATE')
  @Audit({ action: 'SAVE_FORM_OVERRIDE', module: 'FORMS' })
  @ApiOperation({ summary: 'Save JSON Patch overrides for a branch or department' })
  saveOverride(
    @Param('id') id: string,
    @Body() dto: import('./dto/save-override.dto').SaveOverrideDto,
    @CurrentUser() actor: User,
  ) {
    return this.documentOverrideService.saveOverride(
      id,
      dto.scope,
      dto.branchId || null,
      dto.departmentCode || null,
      dto.patches,
      actor.id,
    );
  }

  @Get('documents/:id/overrides')
  @RequirePermissions('FORMS:DESIGNER:READ')
  @ApiOperation({ summary: 'Get the latest override for a branch or department' })
  getOverride(
    @Param('id') id: string,
    @Query('scope') scope: 'branch' | 'department',
    @Query('branchId') branchId?: string,
    @Query('departmentCode') departmentCode?: string,
  ) {
    return this.documentOverrideService.getLatestOverride(
      id,
      scope,
      branchId || null,
      departmentCode || null,
    );
  }
}
