import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { FormsImportService } from './forms-import.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';

@ApiTags('Forms Import')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('forms/import')
export class FormsImportController {
  constructor(private readonly importService: FormsImportService) {}

  /**
   * Upload a PDF or image — starts the AI pipeline, returns jobId immediately.
   * The client polls GET /forms/import/jobs/:jobId for progress.
   */
  @Post('upload')
  @RequirePermissions('FORMS:DESIGNER:CREATE')
  @ApiOperation({ summary: 'Upload a PDF/image form — starts AI import pipeline' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadForm(@UploadedFile() file: Express.Multer.File, @CurrentUser() actor: User) {
    if (!file) throw new Error('No file uploaded');
    return this.importService.createJob(file.buffer, file.originalname, file.mimetype, actor.id);
  }

  /**
   * Poll the current state of an import pipeline job.
   * Returns status, progress, classified fields, suggestions.
   */
  @Get('jobs/:jobId')
  @RequirePermissions('FORMS:DESIGNER:READ')
  @ApiOperation({ summary: 'Get import job status and results' })
  getJob(@Param('jobId') jobId: string) {
    return this.importService.getJob(jobId);
  }

  /**
   * Returns the original uploaded file binary for side-by-side comparison in Review Mode.
   */
  @Get('jobs/:jobId/original')
  @RequirePermissions('FORMS:DESIGNER:READ')
  @ApiOperation({ summary: 'Download original uploaded file for side-by-side review' })
  async getOriginalFile(@Param('jobId') jobId: string, @Res() res: Response) {
    const { buffer, mimeType, fileName } = await this.importService.getOriginalFile(jobId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  /**
   * Accept or reject an AI suggestion in Review Mode.
   */
  @Patch('jobs/:jobId/suggestions/:suggestionId')
  @RequirePermissions('FORMS:DESIGNER:UPDATE')
  @ApiOperation({ summary: 'Accept or reject an AI suggestion' })
  respondToSuggestion(
    @Param('jobId') jobId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() body: { accepted: boolean },
    @CurrentUser() actor: User,
  ) {
    return this.importService.respondToSuggestion(jobId, suggestionId, body.accepted, actor.id);
  }

  /**
   * Finalize a reviewed import — creates a draft document in the Document Engine.
   * The AI never publishes automatically; this always produces a draft.
   */
  @Post('jobs/:jobId/finalize')
  @RequirePermissions('FORMS:DESIGNER:CREATE')
  @ApiOperation({ summary: 'Finalize reviewed import — creates a draft document' })
  finalizeJob(
    @Param('jobId') jobId: string,
    @Body() body: { formName: string },
    @CurrentUser() actor: User,
  ) {
    return this.importService.finalizeJob(jobId, body.formName ?? 'Imported Form', actor.id);
  }
}
