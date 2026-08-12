export interface IncidentDomainEvent {
  eventId: string;
  correlationId: string;
  tenantId: string | null;
  timestamp: Date;
  actorId: string | null;
  incidentId: string;
  entityVersion: number;
}

export class IncidentAssignedEvent implements IncidentDomainEvent {
  constructor(
    public readonly eventId: string,
    public readonly correlationId: string,
    public readonly tenantId: string | null,
    public readonly timestamp: Date,
    public readonly actorId: string | null,
    public readonly incidentId: string,
    public readonly entityVersion: number,
    public readonly assigneeId: string,
    public readonly teamMemberIds?: string[],
  ) {}
}

export class IncidentReassignedEvent implements IncidentDomainEvent {
  constructor(
    public readonly eventId: string,
    public readonly correlationId: string,
    public readonly tenantId: string | null,
    public readonly timestamp: Date,
    public readonly actorId: string | null,
    public readonly incidentId: string,
    public readonly entityVersion: number,
    public readonly previousAssigneeId: string,
    public readonly newAssigneeId: string,
    public readonly teamMemberIds?: string[],
  ) {}
}

export class IncidentSlaBreachedEvent implements IncidentDomainEvent {
  constructor(
    public readonly eventId: string,
    public readonly correlationId: string,
    public readonly tenantId: string | null,
    public readonly timestamp: Date,
    public readonly actorId: string | null, // usually system for cron
    public readonly incidentId: string,
    public readonly entityVersion: number,
    public readonly stage: 'RESPONSE' | 'CAPA' | 'CLOSURE',
    public readonly overdueHours: number,
  ) {}
}

export class IncidentSlaWarningEvent implements IncidentDomainEvent {
  constructor(
    public readonly eventId: string,
    public readonly correlationId: string,
    public readonly tenantId: string | null,
    public readonly timestamp: Date,
    public readonly actorId: string | null,
    public readonly incidentId: string,
    public readonly entityVersion: number,
    public readonly stage: 'RESPONSE' | 'CAPA' | 'CLOSURE',
    public readonly hoursRemaining: number,
  ) {}
}

export class IncidentCommentAddedEvent implements IncidentDomainEvent {
  constructor(
    public readonly eventId: string,
    public readonly correlationId: string,
    public readonly tenantId: string | null,
    public readonly timestamp: Date,
    public readonly actorId: string,
    public readonly incidentId: string,
    public readonly entityVersion: number,
    public readonly commentId: string,
    public readonly visibility: 'PUBLIC' | 'INTERNAL',
  ) {}
}

// Additional events can be easily added here
export class IncidentStatusChangedEvent implements IncidentDomainEvent {
  constructor(
    public readonly eventId: string,
    public readonly correlationId: string,
    public readonly tenantId: string | null,
    public readonly timestamp: Date,
    public readonly actorId: string | null,
    public readonly incidentId: string,
    public readonly entityVersion: number,
    public readonly oldStatus: string,
    public readonly newStatus: string,
  ) {}
}
