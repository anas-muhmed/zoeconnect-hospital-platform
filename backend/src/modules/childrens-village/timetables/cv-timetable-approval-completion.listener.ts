import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CV_TIMETABLE_APPROVAL_COMPLETED_EVENT,
  CvTimetableApprovalCompletedPayload,
} from './cv-timetable-workflow.service';
import { CvTimetableLifecycleService } from './cv-timetable-lifecycle.service';
import { CvTeacherRequestService } from './cv-teacher-request.service';

/**
 * Phase 6 -- decouples `CvTimetableWorkflowService` (approval engine) from
 * `CvTimetableLifecycleService` (version state machine) so neither has to
 * inject the other directly (which would be a circular DI dependency:
 * lifecycle calls workflow to START an approval, workflow needs to call
 * lifecycle back to FINISH publishing once approval completes). Uses the
 * app's existing `EventEmitterModule` (already registered globally in
 * `app.module.ts`, used the same way by document-platform's own
 * `TaskEngineService`) rather than introducing a new decoupling mechanism.
 *
 * Phase 7 extends the same listener (rather than adding a second one) to
 * also route `TEACHER_REQUEST` completions to `CvTeacherRequestService` --
 * same one-directional dependency shape, no new circular-DI risk (neither
 * `CvTimetableLifecycleService` nor `CvTeacherRequestService` depends on
 * this listener or on each other).
 */
@Injectable()
export class CvTimetableApprovalCompletionListener {
  private readonly logger = new Logger(CvTimetableApprovalCompletionListener.name);

  constructor(
    private readonly lifecycleService: CvTimetableLifecycleService,
    private readonly teacherRequestService: CvTeacherRequestService,
  ) {}

  @OnEvent(CV_TIMETABLE_APPROVAL_COMPLETED_EVENT)
  async handleApprovalCompleted(payload: CvTimetableApprovalCompletedPayload): Promise<void> {
    try {
      if (payload.sourceType === 'TIMETABLE_PUBLISH') {
        await this.lifecycleService.markApprovalOutcome(payload.actorId, payload.sourceId, payload.outcome);
        return;
      }
      if (payload.sourceType === 'TEACHER_REQUEST') {
        await this.teacherRequestService.markApprovalOutcome(payload.actorId, payload.sourceId, payload.outcome);
        return;
      }
      // Future source types can extend this switch when they're built --
      // not building unused branches speculatively now.
    } catch (err) {
      this.logger.error(
        `Failed to apply approval outcome ${payload.outcome} to ${payload.sourceType} ${payload.sourceId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
