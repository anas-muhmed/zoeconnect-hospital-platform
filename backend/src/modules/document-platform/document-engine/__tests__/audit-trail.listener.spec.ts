import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditTrailListener } from '../services/audit-trail.listener';
import { DocumentAuditTrailEntity } from '../entities/document-audit-trail.entity';
import { DocumentStateChangedEvent } from '../../document-events/document.events';

describe('AuditTrailListener', () => {
  let listener: AuditTrailListener;
  let repo: jest.Mocked<Repository<DocumentAuditTrailEntity>>;

  beforeEach(async () => {
    const mockRepo = {
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve({ id: 'audit-123', ...entity })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditTrailListener,
        {
          provide: getRepositoryToken(DocumentAuditTrailEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    listener = module.get<AuditTrailListener>(AuditTrailListener);
    repo = module.get(getRepositoryToken(DocumentAuditTrailEntity));
  });

  it('should save an audit trail entry when document.state_changed event is handled', async () => {
    const event = new DocumentStateChangedEvent(
      'instance-123',
      'draft',
      'in_progress',
      'user-456'
    );

    await listener.handleDocumentStateChangedEvent(event);

    expect(repo.create).toHaveBeenCalledWith({
      instanceId: 'instance-123',
      action: 'STATE_CHANGED',
      actorType: 'user',
      actorId: 'user-456',
      correlationId: undefined,
      beforeState: { status: 'draft' },
      afterState: { status: 'in_progress' },
    });
    expect(repo.save).toHaveBeenCalled();
  });
});
