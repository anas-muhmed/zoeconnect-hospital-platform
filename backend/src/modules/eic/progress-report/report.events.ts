/**
 * Domain events emitted by the EIC Progress Report service.
 * Consumers subscribe via @nestjs/event-emitter without coupling to this module.
 */

export const REPORT_EVENTS = {
  CREATED:              'eic.report.created',
  SECTION_SUBMITTED:    'eic.report.section.submitted',
  READY_FOR_SIGNATURE:  'eic.report.ready_for_signature',
  SIGNED:               'eic.report.signed',
} as const;

export type ReportEventName = (typeof REPORT_EVENTS)[keyof typeof REPORT_EVENTS];

/** Base payload carried by all progress report events */
interface BaseReportEvent {
  reportId:     string;
  enrollmentId: string;
  patientId:    string;
  actorId:      string;
  occurredAt:   Date;
}

export class ReportCreatedEvent implements BaseReportEvent {
  constructor(
    public readonly reportId:     string,
    public readonly enrollmentId: string,
    public readonly patientId:    string,
    public readonly actorId:      string,
    public readonly reportNumber: number,
    public readonly occurredAt:   Date = new Date(),
  ) {}
}

export class SectionSubmittedEvent implements BaseReportEvent {
  constructor(
    public readonly reportId:     string,
    public readonly enrollmentId: string,
    public readonly patientId:    string,
    public readonly actorId:      string,
    public readonly discipline:   string,
    public readonly occurredAt:   Date = new Date(),
  ) {}
}

export class ReportReadyForSignatureEvent implements BaseReportEvent {
  constructor(
    public readonly reportId:     string,
    public readonly enrollmentId: string,
    public readonly patientId:    string,
    public readonly actorId:      string,
    public readonly occurredAt:   Date = new Date(),
  ) {}
}

export class ReportSignedEvent implements BaseReportEvent {
  constructor(
    public readonly reportId:      string,
    public readonly enrollmentId:  string,
    public readonly patientId:     string,
    public readonly actorId:       string,
    public readonly signatoryName: string,
    public readonly occurredAt:    Date = new Date(),
  ) {}
}
