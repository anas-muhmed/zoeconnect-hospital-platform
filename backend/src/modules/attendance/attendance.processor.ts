import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../config/redis.config';
import { AttendanceProcessor } from './services/attendance-processor.service';
import { AttendanceStructuredLogger } from './services/attendance-structured-logger.service';
import { LicenseService } from '../licensing/license.service';
import type { AttendanceProcessJob } from './services/realtime-queue.service';

@Processor(QUEUE_NAMES.ATTENDANCE_REALTIME)
export class AttendanceQueueProcessor {
  private loggedUnlicensedSkip = false;

  constructor(
    private readonly processor: AttendanceProcessor,
    private readonly attendanceLogger: AttendanceStructuredLogger,
    private readonly licenseService: LicenseService,
  ) {}

  @Process('process-punch')
  async handlePunch(job: Job<AttendanceProcessJob>): Promise<void> {
    const licensed = await this.licenseService.isModuleLicensed('ATTENDANCE');
    if (!licensed) {
      if (!this.loggedUnlicensedSkip) {
        this.attendanceLogger.info('ATTENDANCE module not licensed — attendance queue job processing paused.', {
          processingStage: 'QUEUE_PROCESSING',
          success: true,
        });
        this.loggedUnlicensedSkip = true;
      }
      return;
    }
    this.loggedUnlicensedSkip = false;

    const startedAt = this.attendanceLogger.time();
    this.attendanceLogger.info('Attendance queue job started', {
      attlogId: job.data.eventId,
      processingStage: 'QUEUE_PROCESSING',
      success: true,
      metadata: { jobId: job.id, attempt: job.attemptsMade + 1 },
    });
    await this.processor.processEvent(job.data.eventId, job.data.mode ?? 'REALTIME');
    this.attendanceLogger.info('Attendance queue job completed', {
      attlogId: job.data.eventId,
      processingStage: 'QUEUE_PROCESSING',
      executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      success: true,
      metadata: { jobId: job.id, attempt: job.attemptsMade + 1 },
    });
  }

  @OnQueueFailed()
  onFailed(job: Job<AttendanceProcessJob>, err: Error): void {
    this.attendanceLogger.error('Attendance queue job failed', {
      attlogId: job.data.eventId,
      processingStage: 'QUEUE_ERROR',
      metadata: { jobId: job.id, attemptsMade: job.attemptsMade },
      }, err);
  }
}
