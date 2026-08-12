import { Controller, Get, Query, UseGuards, UseInterceptors, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ActiveBranchId } from '../../../common/decorators/active-branch.decorator';
import { FeedbackReportService } from './feedback-report.service';

/**
 * CSV exports over submissions/complaints/answers -- the "raw rows" phase
 * that pairs with FeedbackAnalyticsController's rollup dashboard. `@Res()`
 * typed against `express.Response` for convenience, but this app actually
 * runs on `@nestjs/platform-fastify` -- Fastify's reply object does NOT
 * have Express's `.set(object)` (confirmed the hard way: it throws
 * "res.set is not a function" at runtime, despite `ReportsController`
 * elsewhere in the codebase using that same pattern -- that existing code
 * is apparently untested against a real request). `.header(key, value)`
 * and `.send()` are the two methods both Express's `Response` and
 * Fastify's `Reply` actually share, so those are used here instead.
 */
@ApiTags('Feedback Reports')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('feedback/reports')
export class FeedbackReportController {
  constructor(private readonly reportService: FeedbackReportService) {}

  private _send(res: Response, filename: string, csv: string) {
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM so Excel opens it as UTF-8 rather than guessing the system codepage
  }

  @Get('export/submissions')
  @RequirePermissions('FEEDBACK:REPORT:VIEW')
  @ApiOperation({ summary: 'Export a submissions summary as CSV' })
  @ApiQuery({ name: 'campaignId', required: false })
  @ApiQuery({ name: 'formId', required: false })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async exportSubmissions(
    @ActiveBranchId() branchId: string,
    @Res() res: Response,
    @Query('campaignId') campaignId?: string,
    @Query('formId') formId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const csv = await this.reportService.exportSubmissionsCsv(branchId, { campaignId, formId, days: daysRaw ? Number(daysRaw) : undefined });
    this._send(res, `feedback-submissions-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  @Get('export/complaints')
  @RequirePermissions('FEEDBACK:REPORT:VIEW')
  @ApiOperation({ summary: 'Export complaints as CSV' })
  @ApiQuery({ name: 'campaignId', required: false })
  @ApiQuery({ name: 'formId', required: false })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async exportComplaints(
    @ActiveBranchId() branchId: string,
    @Res() res: Response,
    @Query('campaignId') campaignId?: string,
    @Query('formId') formId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const csv = await this.reportService.exportComplaintsCsv(branchId, { campaignId, formId, days: daysRaw ? Number(daysRaw) : undefined });
    this._send(res, `feedback-complaints-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  @Get('export/answers')
  @RequirePermissions('FEEDBACK:REPORT:VIEW')
  @ApiOperation({ summary: 'Export one row per answer (submission + question + answer) as CSV' })
  @ApiQuery({ name: 'campaignId', required: false })
  @ApiQuery({ name: 'formId', required: false })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async exportAnswers(
    @ActiveBranchId() branchId: string,
    @Res() res: Response,
    @Query('campaignId') campaignId?: string,
    @Query('formId') formId?: string,
    @Query('days') daysRaw?: string,
  ) {
    const csv = await this.reportService.exportAnswersCsv(branchId, { campaignId, formId, days: daysRaw ? Number(daysRaw) : undefined });
    this._send(res, `feedback-answers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }
}
