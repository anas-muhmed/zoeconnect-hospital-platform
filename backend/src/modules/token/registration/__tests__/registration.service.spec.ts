import { ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { RegistrationService } from '../registration.service';
import { TokenRecord } from '../../entities/token-record.entity';
import { TokenReservation } from '../entities/token-reservation.entity';
import { TokenPatientMapping } from '../entities/token-patient-mapping.entity';
import { MappingAuditLog } from '../entities/mapping-audit-log.entity';

/**
 * RegistrationService is instantiated directly (no Nest TestingModule) so this
 * spec has no dependency on the rest of the module graph -- it only needs the
 * five repositories/datasource RegistrationService's constructor declares.
 */

function makeTokenRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    id: 'token-uuid-1',
    branchId: 'BR1',
    referenceType: 'LOCATION',
    referenceId: 'loc-1',
    tokenNumber: 42,
    tokenPrefix: 'R',
    fullToken: 'R-042',
    tokenType: 'WALK_IN',
    priority: 100,
    status: 'WAITING',
    counterId: null,
    kioskId: null,
    appointmentId: null,
    calledBy: null,
    calledAt: null,
    servedAt: null,
    completedAt: null,
    estimatedWaitSeconds: null,
    issuedAt: new Date(),
    createdAt: new Date(),
    reissuedFromId: null,
    reissuedToId: null,
    registeredAt: null,
    registrationUser: null,
    supervisorResetAt: null,
    supervisorResetBy: null,
    supervisorResetNote: null,
    counter: null,
    kiosk: null,
    ...overrides,
  } as unknown as TokenRecord;
}

function mockRepo<T>(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
    save: jest.fn(),
    create: jest.fn((x: any) => x),
    findOneOrFail: jest.fn(),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as any;
}

function buildService(opts: {
  tokenRecord?: TokenRecord | null;
  existingUserReservation?: TokenReservation | null;
  existingTokenReservation?: TokenReservation | null;
  existingMapping?: TokenPatientMapping | null;
} = {}) {
  const tokenRepo = mockRepo();
  tokenRepo.findOne.mockResolvedValue(opts.tokenRecord ?? makeTokenRecord());

  const reservationRepo = mockRepo();
  reservationRepo.findOne
    .mockResolvedValueOnce(opts.existingUserReservation ?? null)
    .mockResolvedValueOnce(opts.existingTokenReservation ?? null);
  reservationRepo.save.mockImplementation((x: any) => Promise.resolve({ id: 'res-1', ...x }));

  const mappingRepo = mockRepo();
  mappingRepo.findOne.mockResolvedValue(opts.existingMapping ?? null);

  const auditRepo = mockRepo();
  auditRepo.save.mockResolvedValue(undefined);

  const locationRepo = mockRepo();
  locationRepo.findOne.mockResolvedValue(null);

  const jwtService = { sign: jest.fn().mockReturnValue('mock-capability-token') };

  // Stage B (Checkpoint B3.8/B5) additions to RegistrationService's
  // constructor -- scopedTokenRepo/scopedMappingRepo/scopedReservationRepo
  // back getTokenState()/getMappingByMrn() (not exercised by this spec's
  // tested methods, so bare stubs are enough); chainResolver.resolveDefaultTenantIgnoringBranch()
  // IS called inline by reserveToken()/mapVisit()/supervisorReset(), so it
  // needs a working mock.
  const scopedTokenRepo = {} as any;
  const scopedMappingRepo = {} as any;
  const scopedReservationRepo = {} as any;
  const chainResolver = { resolveDefaultTenantIgnoringBranch: jest.fn().mockResolvedValue('tenant-1') };

  const em = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    save: jest.fn((_entity: any, x: any) => Promise.resolve({ id: 'mapping-1', ...x })),
    create: jest.fn((_entity: any, x: any) => x),
    findOneOrFail: jest.fn(),
  };

  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb(em)),
  };

  const service = new RegistrationService(
    dataSource as any,
    tokenRepo as any,
    reservationRepo as any,
    mappingRepo as any,
    auditRepo as any,
    locationRepo as any,
    jwtService as any,
    scopedTokenRepo,
    scopedMappingRepo,
    scopedReservationRepo,
    chainResolver as any,
  );

  return { service, tokenRepo, reservationRepo, mappingRepo, auditRepo, locationRepo, em, dataSource, jwtService };
}

describe('RegistrationService', () => {
  describe('reserveToken', () => {
    it('creates a reservation when the token is free', async () => {
      const { service, reservationRepo } = buildService();
      const reservation = await service.reserveToken(
        'R-042',
        { reservationId: 'rid-1' },
        'user-1',
        '127.0.0.1',
      );
      expect(reservation).toBeDefined();
      expect(reservationRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when the token does not exist', async () => {
      const { service, tokenRepo } = buildService();
      tokenRepo.findOne.mockResolvedValue(null);
      await expect(
        service.reserveToken('R-999', { reservationId: 'rid-1' }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when the user already holds an active reservation', async () => {
      const { service } = buildService({
        existingUserReservation: {
          tokenNumber: 'R-001',
          expiresAt: new Date(Date.now() + 10_000),
        } as TokenReservation,
      });
      await expect(
        service.reserveToken('R-042', { reservationId: 'rid-2' }, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when another user already holds this token (race condition)', async () => {
      const { service } = buildService({
        existingTokenReservation: {
          expiresAt: new Date(Date.now() + 10_000),
        } as TokenReservation,
      });
      await expect(
        service.reserveToken('R-042', { reservationId: 'rid-3' }, 'user-2'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for a token that is not WAITING/CALLED', async () => {
      const { service } = buildService({ tokenRecord: makeTokenRecord({ status: 'REGISTERED' }) });
      await expect(
        service.reserveToken('R-042', { reservationId: 'rid-4' }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findActiveReservation / heartbeat / release', () => {
    function withActiveReservation() {
      const { service, reservationRepo, tokenRepo, ...rest } = buildService();
      reservationRepo.findOne.mockReset();
      reservationRepo.findOne.mockResolvedValue({
        id: 'res-1',
        tokenRecordId: 'token-uuid-1',
        reservationId: 'rid-1',
        reservedByUser: 'user-1',
        expiresAt: new Date(Date.now() + 10_000),
      });
      return { service, reservationRepo, tokenRepo, ...rest };
    }

    it('heartbeat extends the reservation for the owning user', async () => {
      const { service, reservationRepo } = withActiveReservation();
      const result = await service.heartbeat('R-042', { reservationId: 'rid-1' }, 'user-1');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(reservationRepo.update).toHaveBeenCalled();
    });

    it('heartbeat rejects a mismatched reservationId (tab-switch protection)', async () => {
      const { service } = withActiveReservation();
      await expect(
        service.heartbeat('R-042', { reservationId: 'wrong-id' }, 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('heartbeat rejects a different user than the reservation owner', async () => {
      const { service } = withActiveReservation();
      await expect(
        service.heartbeat('R-042', { reservationId: 'rid-1' }, 'someone-else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('releaseReservation marks the reservation released with MANUAL_RELEASE', async () => {
      const { service, reservationRepo } = withActiveReservation();
      await service.releaseReservation('R-042', { reservationId: 'rid-1' }, 'user-1');
      expect(reservationRepo.update).toHaveBeenCalledWith(
        'res-1',
        expect.objectContaining({ releaseReason: 'MANUAL_RELEASE' }),
      );
    });
  });

  describe('mapPatient', () => {
    it('inserts a mapping, sets token REGISTERED, releases reservation, writes audit', async () => {
      const { service, em } = buildService();
      em.findOne.mockResolvedValueOnce(makeTokenRecord()); // token lookup
      em.findOne.mockResolvedValueOnce(null); // no existing mapping

      const mapping = await service.mapPatient(
        { tokenNumber: 'R-042', hisPatientId: 'HIS-1', mrn: 'MRN-1' },
        'user-1',
        '127.0.0.1',
      );

      expect(mapping).toBeDefined();
      expect(em.update).toHaveBeenCalledWith(
        TokenRecord,
        { id: 'token-uuid-1' },
        expect.objectContaining({ status: 'REGISTERED', registeredAt: expect.any(Date), registrationUser: 'user-1' }),
      );
    });

    it('throws ConflictException when the token is already REGISTERED', async () => {
      const { service, em } = buildService();
      em.findOne.mockResolvedValueOnce(makeTokenRecord({ status: 'REGISTERED' }));

      await expect(
        service.mapPatient({ tokenNumber: 'R-042', hisPatientId: 'HIS-1', mrn: 'MRN-1' }, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException on duplicate mapping', async () => {
      const { service, em } = buildService();
      em.findOne.mockResolvedValueOnce(makeTokenRecord());
      em.findOne.mockResolvedValueOnce({ id: 'existing-mapping' });

      await expect(
        service.mapPatient({ tokenNumber: 'R-042', hisPatientId: 'HIS-1', mrn: 'MRN-1' }, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when the token does not exist', async () => {
      const { service, em } = buildService();
      em.findOne.mockResolvedValueOnce(null);

      await expect(
        service.mapPatient({ tokenNumber: 'R-999', hisPatientId: 'HIS-1', mrn: 'MRN-1' }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('mapVisit', () => {
    it('updates visitId on an existing mapping', async () => {
      const { service, mappingRepo } = buildService({
        existingMapping: { id: 'mapping-1', tokenRecordId: 'token-uuid-1' } as TokenPatientMapping,
      });
      mappingRepo.findOneOrFail.mockResolvedValue({ id: 'mapping-1', visitId: 'V-1' });

      const result = await service.mapVisit({ tokenNumber: 'R-042', visitId: 'V-1' }, 'user-1');
      expect(result.visitId).toBe('V-1');
      expect(mappingRepo.update).toHaveBeenCalledWith(
        'mapping-1',
        expect.objectContaining({ visitId: 'V-1' }),
      );
    });

    it('throws BadRequestException when Stage 1 has not been completed', async () => {
      const { service } = buildService({ existingMapping: null });
      await expect(
        service.mapVisit({ tokenNumber: 'R-042', visitId: 'V-1' }, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('supervisorReset', () => {
    it('resets a REGISTERED token to CALLED and preserves the mapping with a flag', async () => {
      const { service, em } = buildService();
      em.findOne
        .mockResolvedValueOnce(makeTokenRecord({ status: 'REGISTERED' })) // token
        .mockResolvedValueOnce({ id: 'mapping-1', metadata: {} }); // mapping
      em.findOneOrFail.mockResolvedValue(makeTokenRecord({ status: 'CALLED' }));

      const result = await service.supervisorReset(
        'R-042',
        { targetStatus: 'CALLED', reason: 'Stuck mapping, patient re-registering' },
        'supervisor-1',
      );

      expect(result.status).toBe('CALLED');
      expect(em.update).toHaveBeenCalledWith(
        TokenRecord,
        { id: 'token-uuid-1' },
        expect.objectContaining({
          status: 'CALLED',
          supervisorResetBy: 'supervisor-1',
          supervisorResetNote: 'Stuck mapping, patient re-registering',
        }),
      );
    });

    it('throws BadRequestException when the token is not REGISTERED', async () => {
      const { service, em } = buildService();
      em.findOne.mockResolvedValueOnce(makeTokenRecord({ status: 'WAITING' }));

      await expect(
        service.supervisorReset('R-042', { targetStatus: 'CALLED', reason: 'x' }, 'supervisor-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
