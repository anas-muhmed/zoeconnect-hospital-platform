import { Injectable } from '@nestjs/common';
import { EicReportStatus } from '../common/enums/assessment-status.enum';
import { WorkflowPolicy } from './workflow-policy.interface';

export enum ReportEvent {
  ALL_SECTIONS_SUBMITTED = 'ALL_SECTIONS_SUBMITTED',
  SIGN                   = 'SIGN',
}

type Transition = {
  from:    EicReportStatus;
  event:   ReportEvent;
  to:      EicReportStatus;
  message: string;
};

const TRANSITIONS: Transition[] = [
  {
    from:    EicReportStatus.IN_PROGRESS,
    event:   ReportEvent.ALL_SECTIONS_SUBMITTED,
    to:      EicReportStatus.PENDING_SIGNATURE,
    message: 'Report must be IN_PROGRESS to move to pending signature.',
  },
  {
    from:    EicReportStatus.PENDING_SIGNATURE,
    event:   ReportEvent.SIGN,
    to:      EicReportStatus.SIGNED,
    message: 'Report must be PENDING_SIGNATURE to be signed.',
  },
];

@Injectable()
export class EicProgressReportPolicy
  implements WorkflowPolicy<EicReportStatus, ReportEvent>
{
  private find(currentStatus: EicReportStatus, event: ReportEvent): Transition | undefined {
    return TRANSITIONS.find((t) => t.from === currentStatus && t.event === event);
  }

  canTransition(currentStatus: EicReportStatus, event: ReportEvent): boolean {
    return !!this.find(currentStatus, event);
  }

  nextState(currentStatus: EicReportStatus, event: ReportEvent): EicReportStatus {
    const t = this.find(currentStatus, event);
    if (!t) {
      throw new Error(
        `No transition defined for status=${currentStatus} event=${event}. Call canTransition first.`,
      );
    }
    return t.to;
  }

  guardMessage(currentStatus: EicReportStatus, event: ReportEvent): string {
    const t = this.find(currentStatus, event);
    return t?.message ?? `Transition not allowed: status=${currentStatus} event=${event}`;
  }
}
