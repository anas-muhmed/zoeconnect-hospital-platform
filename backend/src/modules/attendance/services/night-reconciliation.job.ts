import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AttendanceEvent } from '../entities/attendance-event.entity';
import { AttendanceReconciliation } from '../entities/attendance-reconciliation.entity';
import { AttendanceProcessor } from './attendance-processor.service';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import { AttendanceConfigService } from './attendance-config.service';
import { LicenseService } from '../../licensing/license.service';

@Injectable()
export class NightReconciliationJob {
  private loggedUnlicensedSkip = false;

  constructor(
    @InjectRepository(AttendanceEvent)
    private readonly eventRepo: Repository<AttendanceEvent>,
    @InjectRepository(AttendanceReconciliation)
    private readonly reconRepo: Repository<AttendanceReconciliation>,
    private readonly processor: AttendanceProcessor,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly attendanceConfig: AttendanceConfigService,
    private readonly licenseService: LicenseService,
  ) {}

  @Cron(process.env['ATTENDANCE_RECON_CRON'] ?? '0 30 1 * * *')
  async reconcileYesterday(): Promise<void> {
    const licensed = await this.licenseService.isModuleLicensed('ATTENDANCE');
    if (!licensed) {
      if (!this.loggedUnlicensedSkip) {
        this.attendanceLogger.info('ATTENDANCE module not licensed — nightly attendance reconciliation cron paused.', {
          processingStage: 'RECONCILIATION_JOB',
          success: true,
        });
        this.loggedUnlicensedSkip = true;
      }
      return;
    }
    this.loggedUnlicensedSkip = false;

    const to = new Date();
    const from = new Date(to.getTime() - 30 * 60 * 60 * 1000);
    await this.reconcileWindow(from, to);
  }

  async reconcileWindow(from: Date, to: Date): Promise<AttendanceReconciliation> {
    const startedAt = this.attendanceLogger.time();
    const run = await this.reconRepo.save(this.reconRepo.create({
      runDate: new Date().toISOString().slice(0, 10),
      fromDateTime: from,
      toDateTime: to,
      status: 'RUNNING',
      processedCount: 0,
      failedCount: 0,
      errorMessage: null,
    }));

    try {
      this.attendanceLogger.info('Attendance reconciliation started', {
        processingStage: 'RECONCILIATION_JOB',
        success: true,
        metadata: { from: from.toISOString(), to: to.toISOString(), runId: run.id },
      });
      const { reconBatchSize } = await this.attendanceConfig.getRuntimeConfig();
      const events = await this.eventRepo.find({
        where: { logDateTime: Between(from, to) },
        order: { employeeCode: 'ASC', logDateTime: 'ASC' },
        take: reconBatchSize,
      });

      const seen = new Set<string>();
      for (const event of events) {
        const key = `${event.employeeCode}:${event.logDateTime.toISOString().slice(0, 10)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await this.processor.processEvent(event.id, 'RECONCILIATION');
          run.processedCount += 1;
        } catch {
          run.failedCount += 1;
          this.attendanceLogger.warn('Attendance reconciliation event failed and will continue', {
            employeeCode: event.employeeCode,
            attlogId: event.sourceId,
            punchDirection: event.direction,
            punchTime: event.logDateTime,
            processingStage: 'RETRY_LOGIC',
            success: false,
            failure: true,
            metadata: { runId: run.id, eventId: event.id },
          });
        }
      }

      run.status = 'COMPLETED';
      this.attendanceLogger.info('Attendance reconciliation completed', {
        processingStage: 'RECONCILIATION_JOB',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: {
          runId: run.id,
          processedCount: run.processedCount,
          failedCount: run.failedCount,
          uniqueDutyCount: seen.size,
        },
      });
    } catch (err) {
      run.status = 'FAILED';
      run.errorMessage = (err as Error).message;
      this.attendanceLogger.error('Attendance reconciliation failed', {
        processingStage: 'RECONCILIATION_JOB',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        metadata: { runId: run.id, from: from.toISOString(), to: to.toISOString() },
      }, err);
    }

    return this.reconRepo.save(run);
  }
}
