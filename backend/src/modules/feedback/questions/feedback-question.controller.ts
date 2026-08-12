import { Controller, Get, Post, Patch, Delete, Put, Param, Body, UseGuards, UseInterceptors, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { FeedbackQuestionService } from './feedback-question.service';
import { CreateSectionDto, UpdateSectionDto, ReorderSectionsDto } from '../dto/feedback-section.dto';
import {
  CreateQuestionDto, UpdateQuestionDto, ReorderQuestionsDto,
  SetQuestionOptionsDto, SetQuestionConditionsDto,
} from '../dto/feedback-question.dto';

/**
 * Section/Question/Option/Condition management for the Feedback Form
 * Builder (spec §2-3: drag-and-drop question builder + conditional logic).
 * All routes require FEEDBACK:FORM:EDIT -- there's no separate "structure"
 * permission since editing a form's questions IS editing the form. Audit
 * logging happens inside FeedbackQuestionService itself (direct calls to
 * FeedbackAuditService), not via the `@Audit()` decorator -- see the
 * doc comment on FeedbackAuditLog for why that shared mechanism is skipped.
 */
@ApiTags('Feedback Form Builder')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback')
export class FeedbackQuestionController {
  constructor(private readonly questionService: FeedbackQuestionService) {}

  // -- Sections -----------------------------------------------------------------

  @Post('forms/:formId/sections')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Add a section to a form' })
  createSection(@Param('formId', ParseUUIDPipe) formId: string, @Body() dto: CreateSectionDto, @CurrentUser() actor: User) {
    return this.questionService.createSection(formId, dto, actor.id);
  }

  @Patch('sections/:id')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Update a section title/description/order' })
  updateSection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto, @CurrentUser() actor: User) {
    return this.questionService.updateSection(id, dto, actor.id);
  }

  @Delete('sections/:id')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Delete a section and all its questions' })
  removeSection(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.questionService.removeSection(id, actor.id);
  }

  @Patch('forms/:formId/sections/reorder')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Set the display order of a form\'s sections' })
  reorderSections(@Param('formId', ParseUUIDPipe) formId: string, @Body() dto: ReorderSectionsDto, @CurrentUser() actor: User) {
    return this.questionService.reorderSections(formId, dto.sectionIds, actor.id);
  }

  // -- Questions ----------------------------------------------------------------

  @Post('sections/:sectionId/questions')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Add a question to a section' })
  createQuestion(@Param('sectionId', ParseUUIDPipe) sectionId: string, @Body() dto: CreateQuestionDto, @CurrentUser() actor: User) {
    return this.questionService.createQuestion(sectionId, dto, actor.id);
  }

  @Patch('questions/:id')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Update a question' })
  updateQuestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuestionDto, @CurrentUser() actor: User) {
    return this.questionService.updateQuestion(id, dto, actor.id);
  }

  @Delete('questions/:id')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Delete a question' })
  removeQuestion(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.questionService.removeQuestion(id, actor.id);
  }

  @Patch('sections/:sectionId/questions/reorder')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Set the display order of a section\'s questions' })
  reorderQuestions(@Param('sectionId', ParseUUIDPipe) sectionId: string, @Body() dto: ReorderQuestionsDto, @CurrentUser() actor: User) {
    return this.questionService.reorderQuestions(sectionId, dto.questionIds, actor.id);
  }

  // -- Options / Conditions (whole-list replace) ---------------------------------

  @Put('questions/:id/options')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Replace a question\'s option list (RADIO/CHECKBOX/DROPDOWN/MULTI_SELECT)' })
  setOptions(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetQuestionOptionsDto, @CurrentUser() actor: User) {
    return this.questionService.setOptions(id, dto.options, actor.id);
  }

  @Put('questions/:id/conditions')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Replace a question\'s conditional display logic' })
  setConditions(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetQuestionConditionsDto, @CurrentUser() actor: User) {
    return this.questionService.setConditions(id, dto.conditions, actor.id);
  }
}
