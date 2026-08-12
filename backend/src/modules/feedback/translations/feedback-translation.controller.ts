import { Controller, Get, Put, Param, Body, UseGuards, UseInterceptors, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { FeedbackFormService } from '../forms/feedback-form.service';
import { FeedbackTranslationService } from './feedback-translation.service';
import { UpsertTranslationsDto } from '../dto/feedback-translation.dto';

/**
 * Per-form translation editing -- reuses `FEEDBACK:FORM:EDIT` rather than
 * a new permission, since translating a form is a kind of editing it (the
 * builder page these routes back into already requires that permission to
 * open at all). The global language *pool* is managed separately via
 * FeedbackLanguageController under `FEEDBACK:LANGUAGE:MANAGE`.
 */
@ApiTags('Feedback Translations')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/forms/:id')
export class FeedbackTranslationController {
  constructor(
    private readonly formService: FeedbackFormService,
    private readonly translationService: FeedbackTranslationService,
  ) {}

  @Get('languages')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: "This form's authored language plus any language it has translations saved for" })
  async availableLanguages(@Param('id', ParseUUIDPipe) id: string) {
    const form = await this.formService.findOne(id);
    return this.translationService.getAvailableLanguages(form);
  }

  @Get('translations/:languageCode')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Every translatable field on this form, with whatever is already saved for languageCode' })
  getTranslations(@Param('id', ParseUUIDPipe) id: string, @Param('languageCode') languageCode: string) {
    return this.translationService.getFieldsForLanguage(id, languageCode);
  }

  @Put('translations/:languageCode')
  @RequirePermissions('FEEDBACK:FORM:EDIT')
  @ApiOperation({ summary: 'Save translated text for this form/language (upserts each field independently)' })
  async saveTranslations(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('languageCode') languageCode: string,
    @Body() dto: UpsertTranslationsDto,
  ) {
    await this.translationService.upsertTranslations(id, languageCode, dto.items);
    return this.translationService.getFieldsForLanguage(id, languageCode);
  }
}
