import { Controller, Get, Post, Query, Param, UseGuards, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard }        from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard }    from '../../../common/guards/permissions.guard';
import { LicenseGuard }        from '../../licensing/license.guard';
import { RequirePermissions }  from '../../../common/decorators/permissions.decorator';
import { RequireModule }       from '../../licensing/decorators/require-module.decorator';
import { ActiveBranchId }      from '../../../common/decorators/active-branch.decorator';
import { TokenAnalyticsService } from './token-analytics.service';

@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('QUEUE')
@RequirePermissions('TOKEN:ANALYTICS:READ')
@Controller('token/analytics')
export class TokenAnalyticsController {
  constructor(private readonly analyticsService: TokenAnalyticsService) {}

  @Get()
  getAnalytics(
    @ActiveBranchId() branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('referenceType') referenceType?: string,
    @Query('referenceId') referenceId?: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    return this.analyticsService.getAnalytics({
      branchId,
      from:          from  ?? today,
      to:            to    ?? today,
      referenceType,
      referenceId,
    });
  }

  @Post('backfill/:date')
  backfill(@Param('date') date: string) {
    return this.analyticsService.backfill(date);
  }

  /** GAP-13: Real-time stats for today, read directly from token_records. */
  @Get('live')
  getLive(
    @ActiveBranchId() branchId: string,
    @Query('referenceType') referenceType?: string,
    @Query('referenceId') referenceId?: string,
  ) {
    return this.analyticsService.getLiveAnalytics({ branchId, referenceType, referenceId });
  }

  // ── GAP-13: Spec-required analytics endpoints ────────────────────────────

  /** Single-date branch summary (totals + avg wait/serve) */
  @Get('summary')
  getSummary(
    @ActiveBranchId() branchId: string,
    @Query('date') date?: string,
  ) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return this.analyticsService.getSummary({ branchId, date: d });
  }

  /** Daily token volume over a date range */
  @Get('volume')
  getVolume(
    @ActiveBranchId() branchId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    return this.analyticsService.getVolume({
      branchId,
      from: from ?? today,
      to:   to   ?? today,
    });
  }

  /** Wait-time percentile breakdown per reference for a date */
  @Get('wait-times')
  getWaitTimes(
    @ActiveBranchId() branchId: string,
    @Query('date') date?: string,
  ) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return this.analyticsService.getWaitTimes({ branchId, date: d });
  }

  /** Per-counter performance stats for a date */
  @Get('counter-perf')
  getCounterPerf(
    @ActiveBranchId() branchId: string,
    @Query('date') date?: string,
  ) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return this.analyticsService.getCounterPerf({ branchId, date: d });
  }

  /**
   * Export raw token_records as JSON or CSV.
   * GET /token/analytics/export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
   */
  @Get('export')
  async export(
    @ActiveBranchId() branchId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const rows  = await this.analyticsService.exportRecords({
      branchId,
      from: from ?? today,
      to:   to   ?? today,
    });

    if (format === 'csv') {
      if (rows.length === 0) {
        res?.setHeader('Content-Type', 'text/csv');
        res?.setHeader('Content-Disposition', 'attachment; filename="token-export.csv"');
        return '';
      }
      const headers = Object.keys(rows[0] as object).join(',');
      const csvRows = (rows as Record<string, unknown>[]).map((row) =>
        Object.values(row)
          .map((v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`))
          .join(','),
      );
      const csv = [headers, ...csvRows].join('\n');
      res?.setHeader('Content-Type', 'text/csv');
      res?.setHeader('Content-Disposition', 'attachment; filename="token-export.csv"');
      return csv;
    }

    return rows;
  }

}
