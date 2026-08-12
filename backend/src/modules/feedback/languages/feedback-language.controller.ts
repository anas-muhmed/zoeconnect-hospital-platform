import { Controller, Get, Post, Patch, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { FeedbackLanguageService } from './feedback-language.service';
import { CreateLanguageDto, UpdateLanguageDto } from '../dto/feedback-translation.dto';

/**
 * Admin management of the global language pool available for translating
 * forms into -- see FeedbackLanguage's doc comment. No delete route:
 * languages are toggled inactive (via PATCH) rather than removed, since a
 * form may already have translations saved against a language's code and
 * deleting it out from under those rows would orphan them.
 */
@ApiTags('Feedback Languages')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('feedback/languages')
export class FeedbackLanguageController {
  constructor(private readonly languageService: FeedbackLanguageService) {}

  @Get()
  @RequirePermissions('FEEDBACK:LANGUAGE:MANAGE')
  @ApiOperation({ summary: 'List all languages in the supported pool (active and inactive)' })
  list() {
    return this.languageService.list();
  }

  @Post()
  @RequirePermissions('FEEDBACK:LANGUAGE:MANAGE')
  @ApiOperation({ summary: 'Add a language to the supported pool' })
  create(@Body() dto: CreateLanguageDto) {
    return this.languageService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('FEEDBACK:LANGUAGE:MANAGE')
  @ApiOperation({ summary: 'Rename or activate/deactivate a language' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLanguageDto) {
    return this.languageService.update(id, dto);
  }
}
