import {
  Controller, Get, Query, UseGuards, Res, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService }     from './reports.service';
import { JwtAuthGuard }       from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard }   from '../../common/guards/permissions.guard';
import { LicenseGuard }       from '../licensing/license.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule }      from '../licensing/decorators/require-module.decorator';

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('LOYALTY')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions('PLATFORM:REPORTS:READ')
  @ApiOperation({ summary: 'Dashboard KPI metrics' })
  getDashboard() {
    return this.reportsService.getDashboardKpis();
  }

  @Get('tier-distribution')
  @RequirePermissions('PLATFORM:REPORTS:READ')
  @ApiOperation({ summary: 'Member count and points per loyalty tier' })
  getTierDistribution() {
    return this.reportsService.getTierDistribution();
  }

  @Get('daily-volume')
  @RequirePermissions('PLATFORM:REPORTS:READ')
  @ApiOperation({ summary: 'Daily transaction volume for the last N days' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getDailyVolume(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.reportsService.getDailyVolume(Math.min(days, 365));
  }

  @Get('top-earners')
  @RequirePermissions('PLATFORM:REPORTS:READ')
  @ApiOperation({ summary: 'Top N members by lifetime points' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTopEarners(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.reportsService.getTopEarners(Math.min(limit, 200));
  }

  @Get('campaign-performance')
  @RequirePermissions('PLATFORM:REPORTS:READ')
  @ApiOperation({ summary: 'Bonus transactions and points distributed per campaign' })
  getCampaignPerformance() {
    return this.reportsService.getCampaignPerformance();
  }

  @Get('notification-stats')
  @RequirePermissions('PLATFORM:REPORTS:READ')
  @ApiOperation({ summary: 'Notification delivery stats by channel and status' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getNotificationStats(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.reportsService.getNotificationStats(Math.min(days, 365));
  }

  // ── CSV Exports ───────────────────────────────────────────────────────────

  @Get('export/top-earners')
  @RequirePermissions('PLATFORM:REPORTS:READ')
  @ApiOperation({ summary: 'Export top earners as CSV' })
  async exportTopEarners(@Res() res: Response) {
    const csv = await this.reportsService.exportTopEarnersCsv();
    const filename = `hdsp-top-earners-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send('﻿' + csv); // BOM for Excel UTF-8
  }

  @Get('export/daily-volume')
  @RequirePermissions('PLATFORM:REPORTS:READ')
  @ApiOperation({ summary: 'Export daily transaction volume as CSV' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async exportDailyVolume(
    @Res() res: Response,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    const csv = await this.reportsService.exportDailyVolumeCsv(Math.min(days, 365));
    const filename = `hdsp-daily-volume-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send('﻿' + csv);
  }

  @Get('export/campaign-performance')
  @RequirePermissions('PLATFORM:REPORTS:READ')
  @ApiOperation({ summary: 'Export campaign performance as CSV' })
  async exportCampaignPerformance(@Res() res: Response) {
    const csv = await this.reportsService.exportCampaignPerformanceCsv();
    const filename = `hdsp-campaign-performance-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send('﻿' + csv);
  }
}
