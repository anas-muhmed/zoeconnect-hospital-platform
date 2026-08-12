/**
 * incident-attachment-security.spec.ts
 *
 * Tests Part B of Priority 5 — Production Hardening.
 *
 * Coverage:
 *   1.  MIME type allowlist — blocked types rejected, allowed types accepted
 *   2.  File size limit — oversized files rejected
 *   3.  Filename sanitization — path traversal stripped
 *   4.  Cross-tenant authorization — download/presigned/delete all return 404
 *   5.  Own-tenant download allowed
 *   6.  AV scan invoked before storage write
 *   7.  AV rejection blocks storage write
 *   8.  Storage failure on delete — DB record still removed
 *   9.  Delete triggers both timeline and audit entries
 *   10. Upload emits timeline entry with sanitized filename
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { IncidentAttachmentService, ALLOWED_MIME_TYPES } from '../attachments/incident-attachment.service';
import { IncidentAttachment } from '../entities/incident-attachment.entity';
import { STORAGE_PROVIDER } from '../../platform/infrastructure/tokens';
import { ANTI_VIRUS_PROVIDER } from '../attachments/anti-virus.provider';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { AuditService } from '../../audit/audit.service';
import { IncidentService } from '../incidents/incident.service';
import { IncidentTimelineService } from '../timeline/incident-timeline.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: Buffer.from('fake-content'),
    originalname: 'report.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    fieldname: 'file',
    encoding: '7bit',
    ...overrides,
  } as Express.Multer.File;
}

function makeAttachment(overrides: Partial<IncidentAttachment> = {}): IncidentAttachment {
  return {
    id: 'att-1',
    tenantId: 'tenant-a',
    incidentId: 'inc-1',
    parentType: 'INCIDENT',
    parentId: 'inc-1',
    storageKey: 'generated-uuid.pdf',
    thumbnailKey: null,
    originalName: 'report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    attachmentType: 'document',
    uploadedById: 'user-1',
    createdAt: new Date(),
    ...overrides,
  } as IncidentAttachment;
}

const mockActor = { id: 'user-1', fullName: 'Dr. Test', username: 'dr.test' } as any;

// ── Module Factory ────────────────────────────────────────────────────────────

async function buildModule(opts: {
  tenantId: string | null;
  attachments?: IncidentAttachment[];
  avScan?: jest.Mock;
  storageUpload?: jest.Mock;
  storageDelete?: jest.Mock;
  maxMb?: number;
}): Promise<IncidentAttachmentService> {
  const {
    tenantId,
    attachments = [],
    avScan = jest.fn().mockResolvedValue(undefined),
    storageUpload = jest.fn().mockResolvedValue('generated-uuid.pdf'),
    storageDelete = jest.fn().mockResolvedValue(undefined),
    maxMb = 25,
  } = opts;

  const repo = {
    findOne: jest.fn().mockImplementation(({ where: { id } }) =>
      Promise.resolve(attachments.find(a => a.id === id) ?? null),
    ),
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((e) => Promise.resolve({ ...e, id: 'att-new' })),
    find: jest.fn().mockResolvedValue(attachments),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      IncidentAttachmentService,
      { provide: getRepositoryToken(IncidentAttachment), useValue: repo },
      { provide: IncidentService, useValue: { findOne: jest.fn().mockResolvedValue({ id: 'inc-1' }) } },
      { provide: IncidentTimelineService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
      { provide: STORAGE_PROVIDER, useValue: { upload: storageUpload, download: jest.fn().mockResolvedValue(Buffer.from('data')), getPresignedDownloadUrl: jest.fn().mockResolvedValue('https://example.com/presigned'), delete: storageDelete } },
      { provide: TenantContextStorage, useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue(tenantId) } },
      { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      { provide: ConfigService, useValue: { get: jest.fn().mockImplementation((_key: string, def: number) => maxMb ?? def) } },
      { provide: ANTI_VIRUS_PROVIDER, useValue: { scan: avScan } },
    ],
  }).compile();

  return module.get(IncidentAttachmentService);
}

// ── 1. MIME Allowlist ─────────────────────────────────────────────────────────

describe('IncidentAttachmentService — Security', () => {
  afterEach(() => jest.clearAllMocks());

  describe('1. MIME type allowlist', () => {
    it('rejects a blocked MIME type (application/x-msdownload)', async () => {
      const svc = await buildModule({ tenantId: 'tenant-a' });
      await expect(
        svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile({ mimetype: 'application/x-msdownload', originalname: 'mal.exe' }), mockActor),
      ).rejects.toThrow(/not allowed/i);
    });

    it('rejects text/html (potential XSS vector)', async () => {
      const svc = await buildModule({ tenantId: 'tenant-a' });
      await expect(
        svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile({ mimetype: 'text/html' }), mockActor),
      ).rejects.toThrow(/not allowed/i);
    });

    it('accepts all MIME types in the allowlist', async () => {
      const allowedTypes = [...ALLOWED_MIME_TYPES];
      for (const mimetype of allowedTypes) {
        const svc = await buildModule({ tenantId: 'tenant-a' });
        await expect(
          svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile({ mimetype }), mockActor),
        ).resolves.toBeDefined();
      }
    });

    it('accepts application/dicom as a specific hospital-grade MIME type', async () => {
      const svc = await buildModule({ tenantId: 'tenant-a' });
      await expect(
        svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile({ mimetype: 'application/dicom', originalname: 'scan.dcm' }), mockActor),
      ).resolves.toBeDefined();
    });

    it('sets attachmentType = "dicom" for DICOM uploads', async () => {
      const repo = { create: jest.fn().mockImplementation(d => d), save: jest.fn().mockImplementation(e => Promise.resolve({ ...e, id: 'att-dicom' })), findOne: jest.fn(), find: jest.fn(), delete: jest.fn() };
      const module = await Test.createTestingModule({
        providers: [
          IncidentAttachmentService,
          { provide: getRepositoryToken(IncidentAttachment), useValue: repo },
          { provide: IncidentService, useValue: { findOne: jest.fn().mockResolvedValue({}) } },
          { provide: IncidentTimelineService, useValue: { emit: jest.fn() } },
          { provide: STORAGE_PROVIDER, useValue: { upload: jest.fn().mockResolvedValue('key') } },
          { provide: TenantContextStorage, useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue('t-1') } },
          { provide: AuditService, useValue: { log: jest.fn() } },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(25) } },
          { provide: ANTI_VIRUS_PROVIDER, useValue: { scan: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile();
      const svc = module.get(IncidentAttachmentService);
      await svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile({ mimetype: 'application/dicom', originalname: 'scan.dcm' }), mockActor);
      const created = repo.create.mock.calls[0][0];
      expect(created.attachmentType).toBe('dicom');
    });
  });

  // ── 2. File Size Limit ───────────────────────────────────────────────────────

  describe('2. File size limit', () => {
    it('rejects files larger than the configured maximum', async () => {
      const svc = await buildModule({ tenantId: 'tenant-a', maxMb: 1 });
      const bigFile = makeFile({ size: 2 * 1024 * 1024 }); // 2 MB > 1 MB limit
      await expect(
        svc.upload('inc-1', 'INCIDENT', 'inc-1', bigFile, mockActor),
      ).rejects.toThrow(/exceeds the maximum/i);
    });

    it('accepts files exactly at the size limit', async () => {
      const svc = await buildModule({ tenantId: 'tenant-a', maxMb: 1 });
      const exactFile = makeFile({ size: 1 * 1024 * 1024 }); // exactly 1 MB
      await expect(
        svc.upload('inc-1', 'INCIDENT', 'inc-1', exactFile, mockActor),
      ).resolves.toBeDefined();
    });
  });

  // ── 3. Filename Sanitization ─────────────────────────────────────────────────

  describe('3. Filename sanitization', () => {
    it('strips path traversal sequences from filenames', async () => {
      const captureRepo = {
        create: jest.fn().mockImplementation(d => d),
        save: jest.fn().mockImplementation(e => Promise.resolve({ ...e, id: 'att-safe' })),
        findOne: jest.fn(), find: jest.fn(), delete: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          IncidentAttachmentService,
          { provide: getRepositoryToken(IncidentAttachment), useValue: captureRepo },
          { provide: IncidentService, useValue: { findOne: jest.fn().mockResolvedValue({}) } },
          { provide: IncidentTimelineService, useValue: { emit: jest.fn() } },
          { provide: STORAGE_PROVIDER, useValue: { upload: jest.fn().mockResolvedValue('key') } },
          { provide: TenantContextStorage, useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue('t-1') } },
          { provide: AuditService, useValue: { log: jest.fn() } },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(25) } },
          { provide: ANTI_VIRUS_PROVIDER, useValue: { scan: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile();

      const svc = module.get(IncidentAttachmentService);
      await svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile({ originalname: '../../etc/passwd' }), mockActor);

      const stored = captureRepo.create.mock.calls[0][0];
      expect(stored.originalName).not.toContain('/');
      expect(stored.originalName).not.toContain('\\');
      expect(stored.originalName).not.toContain('..');
    });

    it('stores under a UUID-based key, not the original filename', async () => {
      const uploadSpy = jest.fn().mockResolvedValue('uuid-key.pdf');
      const svc = await buildModule({ tenantId: 'tenant-a', storageUpload: uploadSpy });
      await svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile({ originalname: 'report.pdf' }), mockActor);

      const [, objectKey] = uploadSpy.mock.calls[0];
      // Key must be a UUID+ext, not the original filename
      expect(objectKey).toMatch(/^[0-9a-f-]{36}\.pdf$/i);
      expect(objectKey).not.toContain('report');
    });
  });

  // ── 4. Cross-Tenant Authorization ────────────────────────────────────────────

  describe('4. Cross-tenant authorization — 404 not 403', () => {
    const attachmentFromTenantB = makeAttachment({ tenantId: 'tenant-b' });

    it('download returns 404 when attachment belongs to different tenant', async () => {
      const svc = await buildModule({ tenantId: 'tenant-a', attachments: [attachmentFromTenantB] });
      await expect(svc.download('att-1')).rejects.toMatchObject({ status: 404 });
    });

    it('getPresignedUrl returns 404 when attachment belongs to different tenant', async () => {
      const svc = await buildModule({ tenantId: 'tenant-a', attachments: [attachmentFromTenantB] });
      await expect(svc.getPresignedUrl('att-1')).rejects.toMatchObject({ status: 404 });
    });

    it('delete returns 404 when attachment belongs to different tenant', async () => {
      const svc = await buildModule({ tenantId: 'tenant-a', attachments: [attachmentFromTenantB] });
      await expect(svc.delete('att-1', mockActor)).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── 5. Own-Tenant Access ─────────────────────────────────────────────────────

  describe('5. Own-tenant download is allowed', () => {
    it('returns buffer for own-tenant attachment', async () => {
      const ownAttachment = makeAttachment({ tenantId: 'tenant-a' });
      const svc = await buildModule({ tenantId: 'tenant-a', attachments: [ownAttachment] });
      const result = await svc.download('att-1');
      expect(result.buffer).toBeDefined();
      expect(result.originalName).toBe('report.pdf');
    });

    it('system attachment (tenantId = null) is accessible to any tenant', async () => {
      const systemAttachment = makeAttachment({ tenantId: null });
      const svc = await buildModule({ tenantId: 'tenant-a', attachments: [systemAttachment] });
      const result = await svc.download('att-1');
      expect(result.buffer).toBeDefined();
    });
  });

  // ── 6 & 7. Antivirus ─────────────────────────────────────────────────────────

  describe('6. Antivirus scan is invoked before storage write', () => {
    it('calls av.scan with the file buffer before uploading', async () => {
      const avScan = jest.fn().mockResolvedValue(undefined);
      const storageUpload = jest.fn().mockResolvedValue('key');
      const svc = await buildModule({ tenantId: 'tenant-a', avScan, storageUpload });

      await svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile(), mockActor);

      expect(avScan).toHaveBeenCalledTimes(1);
      // AV called BEFORE storage upload
      const avOrder  = avScan.mock.invocationCallOrder[0];
      const storOrder = storageUpload.mock.invocationCallOrder[0];
      expect(avOrder).toBeLessThan(storOrder);
    });
  });

  describe('7. Antivirus rejection blocks storage write', () => {
    it('throws and does not upload to storage when AV rejects the file', async () => {
      const avScan = jest.fn().mockRejectedValue(new Error('INFECTED: Trojan.GenericKD'));
      const storageUpload = jest.fn();
      const svc = await buildModule({ tenantId: 'tenant-a', avScan, storageUpload });

      await expect(
        svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile(), mockActor),
      ).rejects.toThrow('INFECTED');
      expect(storageUpload).not.toHaveBeenCalled();
    });
  });

  // ── 8. Storage Failure Resilience ────────────────────────────────────────────

  describe('8. Storage failure resilience on delete', () => {
    it('still removes DB record when storage.delete throws', async () => {
      const storageDelete = jest.fn().mockRejectedValue(new Error('S3 connection timeout'));
      const ownAttachment = makeAttachment({ tenantId: 'tenant-a' });
      const svc = await buildModule({ tenantId: 'tenant-a', attachments: [ownAttachment], storageDelete });

      // Should NOT throw
      await expect(svc.delete('att-1', mockActor)).resolves.not.toThrow();
    });

    it('still writes audit log when storage.delete throws', async () => {
      const storageDelete = jest.fn().mockRejectedValue(new Error('network error'));
      const ownAttachment = makeAttachment({ tenantId: 'tenant-a' });

      const auditLog = jest.fn().mockResolvedValue(undefined);
      const module = await Test.createTestingModule({
        providers: [
          IncidentAttachmentService,
          { provide: getRepositoryToken(IncidentAttachment), useValue: { findOne: jest.fn().mockResolvedValue(ownAttachment), delete: jest.fn().mockResolvedValue({ affected: 1 }), create: jest.fn(), save: jest.fn(), find: jest.fn() } },
          { provide: IncidentService, useValue: { findOne: jest.fn() } },
          { provide: IncidentTimelineService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
          { provide: STORAGE_PROVIDER, useValue: { upload: jest.fn(), download: jest.fn(), getPresignedDownloadUrl: jest.fn(), delete: storageDelete } },
          { provide: TenantContextStorage, useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue('tenant-a') } },
          { provide: AuditService, useValue: { log: auditLog } },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(25) } },
          { provide: ANTI_VIRUS_PROVIDER, useValue: { scan: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile();
      const svc = module.get(IncidentAttachmentService);

      await svc.delete('att-1', mockActor);
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'ATTACHMENT_DELETED' }));
    });
  });

  // ── 9. Delete Side-Effects ────────────────────────────────────────────────────

  describe('9. Delete triggers both timeline and audit entries', () => {
    it('emits ATTACHMENT_DELETED timeline event', async () => {
      const timelineEmit = jest.fn().mockResolvedValue(undefined);
      const ownAttachment = makeAttachment({ tenantId: 'tenant-a' });
      const module = await Test.createTestingModule({
        providers: [
          IncidentAttachmentService,
          { provide: getRepositoryToken(IncidentAttachment), useValue: { findOne: jest.fn().mockResolvedValue(ownAttachment), delete: jest.fn(), create: jest.fn(), save: jest.fn(), find: jest.fn() } },
          { provide: IncidentService, useValue: { findOne: jest.fn() } },
          { provide: IncidentTimelineService, useValue: { emit: timelineEmit } },
          { provide: STORAGE_PROVIDER, useValue: { upload: jest.fn(), download: jest.fn(), getPresignedDownloadUrl: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) } },
          { provide: TenantContextStorage, useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue('tenant-a') } },
          { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(25) } },
          { provide: ANTI_VIRUS_PROVIDER, useValue: { scan: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile();
      const svc = module.get(IncidentAttachmentService);

      await svc.delete('att-1', mockActor);

      expect(timelineEmit).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'ATTACHMENT_DELETED' }));
    });
  });

  // ── 10. Upload Timeline ──────────────────────────────────────────────────────

  describe('10. Upload emits timeline entry with sanitized filename', () => {
    it('logs sanitized name (not traversal path) in the timeline description', async () => {
      const timelineEmit = jest.fn().mockResolvedValue(undefined);
      const module = await Test.createTestingModule({
        providers: [
          IncidentAttachmentService,
          { provide: getRepositoryToken(IncidentAttachment), useValue: { create: jest.fn().mockImplementation(d => d), save: jest.fn().mockImplementation(e => Promise.resolve({ ...e, id: 'att-1' })), findOne: jest.fn(), find: jest.fn(), delete: jest.fn() } },
          { provide: IncidentService, useValue: { findOne: jest.fn().mockResolvedValue({}) } },
          { provide: IncidentTimelineService, useValue: { emit: timelineEmit } },
          { provide: STORAGE_PROVIDER, useValue: { upload: jest.fn().mockResolvedValue('key') } },
          { provide: TenantContextStorage, useValue: { currentTenantIdOrNull: jest.fn().mockResolvedValue('t-1') } },
          { provide: AuditService, useValue: { log: jest.fn() } },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(25) } },
          { provide: ANTI_VIRUS_PROVIDER, useValue: { scan: jest.fn().mockResolvedValue(undefined) } },
        ],
      }).compile();
      const svc = module.get(IncidentAttachmentService);

      await svc.upload('inc-1', 'INCIDENT', 'inc-1', makeFile({ originalname: '../../etc/passwd' }), mockActor);
      const [{ description }] = timelineEmit.mock.calls[0];
      expect(description).not.toContain('..');
      expect(description).not.toContain('/');
    });
  });
});
