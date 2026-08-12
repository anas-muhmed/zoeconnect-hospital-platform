import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '../../../config/redis.config';
import { AttendanceStructuredLogger } from './attendance-structured-logger.service';
import type { AttendanceProcessingMode } from '../attendance.types';

export interface AttendanceProcessJob {
  eventId: string;
  /** Processing mode forwarded to AttendanceProcessor.processEvent(). */
  mode?: AttendanceProcessingMode;
}

@Injectable()
export class RealtimeQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.ATTENDANCE_REALTIME)
    private readonly queue: Queue<AttendanceProcessJob>,
    private readonly attendanceLogger: AttendanceStructuredLogger,
  ) {}

  async enqueue(
    eventId: string,
    employeeCode: string,
    dutyDate: Date,
    mode: AttendanceProcessingMode = 'REALTIME',
  ): Promise<void> {
    const startedAt = this.attendanceLogger.time();
    // NOTE: the jobId MUST be unique per enqueue call, not just per event.
    // Bull's queue.add() silently no-ops (returns the existing job, creates
    // nothing new) when a job with the given jobId already exists — even if
    // that job already failed all its attempts. attendance-listener.service.ts
    // re-enqueues any non-PROCESSED/non-QUEUED event on every poll tick
    // (e.g. a FAILED event), so a stable jobId here meant a second failure
    // permanently orphaned the row: Postgres got flipped back to 'QUEUED'
    // but Bull dropped the "new" job on the floor, and future ticks then
    // skip anything already 'QUEUED' — stuck forever with nothing driving
    // it. Appending Date.now() guarantees each enqueue attempt is a genuine
    // new Bull job while keeping the prefix meaningful for log correlation.
    const jobId = `${employeeCode}:${dutyDate.toISOString().slice(0, 10)}:${eventId}:${Date.now()}`;
    try {
      await this.queue.add(
        'process-punch',
        { eventId, mode },
        {
          jobId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 500,
          removeOnFail: 200,
        },
      );
      this.attendanceLogger.info('Attendance punch queued', {
        employeeCode,
        dutyDate,
        attlogId: eventId,
        processingStage: 'QUEUE_PUBLISH',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
        success: true,
        metadata: { jobId, attempts: 5, mode },
      });
    } catch (err) {
      this.attendanceLogger.error('Attendance queue publish failed', {
        employeeCode,
        dutyDate,
        attlogId: eventId,
        processingStage: 'QUEUE_ERROR',
        executionTimeMs: this.attendanceLogger.elapsed(startedAt),
      }, err);
      throw err;
    }
  }
}
