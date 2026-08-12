import { DocumentInstanceStatus } from '../document-engine/entities/document-instance.entity';

export class DocumentStateChangedEvent {
  constructor(
    public readonly instanceId: string,
    public readonly oldState: DocumentInstanceStatus | null,
    public readonly newState: DocumentInstanceStatus,
    public readonly actorId: string,
    public readonly action?: string,
    public readonly correlationId?: string,
  ) {}
}

export class DocumentCreatedEvent {
  constructor(
    public readonly instanceId: string,
    public readonly documentVersionId: string,
    public readonly actorId: string,
  ) {}
}

export class DocumentAutosavedEvent {
  constructor(
    public readonly instanceId: string,
    public readonly actorId: string,
    public readonly revision: number,
  ) {}
}

export class DocumentFinalizedEvent {
  constructor(
    public readonly instanceId: string,
    public readonly actorId: string,
  ) {}
}

export class SnapshotGeneratedEvent {
  constructor(
    public readonly instanceId: string,
    public readonly snapshotId: string,
  ) {}
}
