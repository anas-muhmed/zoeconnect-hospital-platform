import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IncidentSlaService } from '../incidents/incident-sla.service';
import { Incident } from '../entities/incident.entity';
import { IncidentCapa } from '../entities/incident-capa.entity';
import { IncidentSeverityLevel } from '../entities/incident-severity-level.entity';

describe('IncidentSlaService (SLA Boundary Conditions)', () => {
  let service: IncidentSlaService;
  let severityRepo: any;
  let incidentRepo: any;
  let capaRepo: any;

  let capaQb: any;
  let incidentQb: any;

  beforeEach(async () => {
    incidentQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    capaQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    severityRepo = {
      findOne: jest.fn(),
    };
    incidentRepo = {
      createQueryBuilder: jest.fn(() => incidentQb),
    };
    capaRepo = {
      createQueryBuilder: jest.fn(() => capaQb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentSlaService,
        { provide: getRepositoryToken(Incident), useValue: incidentRepo },
        { provide: getRepositoryToken(IncidentCapa), useValue: capaRepo },
        { provide: getRepositoryToken(IncidentSeverityLevel), useValue: severityRepo },
      ],
    }).compile();

    service = module.get<IncidentSlaService>(IncidentSlaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('computeSlaDeadlines', () => {
    it('returns nulls if severity config is missing', async () => {
      severityRepo.findOne.mockResolvedValue(null);
      const result = await service.computeSlaDeadlines('UNKNOWN', null);
      expect(result).toEqual({
        slaResponseDue: null,
        slaInvestigationDue: null,
        slaCapaDue: null,
        slaClosureDue: null,
      });
    });

    it('computes exact boundaries for SLA deadlines', async () => {
      severityRepo.findOne.mockResolvedValue({
        code: 'HIGH',
        slaResponseHours: 4,
        slaInvestigationHours: 48,
        slaCapaDays: 14,
        slaClosureDays: 30,
      });

      // Fix base date to an exact boundary
      const baseDate = new Date('2026-01-01T12:00:00Z');
      const result = await service.computeSlaDeadlines('HIGH', null, baseDate);

      // Exact boundaries check
      expect(result.slaResponseDue).toEqual(new Date('2026-01-01T16:00:00Z')); // + 4 hours
      expect(result.slaInvestigationDue).toEqual(new Date('2026-01-03T12:00:00Z')); // + 48 hours (2 days)
      expect(result.slaCapaDue).toEqual(new Date('2026-01-15T12:00:00Z')); // + 14 days
      expect(result.slaClosureDue).toEqual(new Date('2026-01-31T12:00:00Z')); // + 30 days
    });

    it('handles DST boundaries cleanly across timezones', async () => {
      severityRepo.findOne.mockResolvedValue({
        code: 'MEDIUM',
        slaCapaDays: 2,
      });

      // Spring forward boundary for US (March 8, 2026 at 2AM local time skips an hour)
      // JS Date maths using timestamps avoids DST jumps inherently. Let's verify:
      // Base: March 7, 2026 12:00 UTC
      const baseDate = new Date('2026-03-07T12:00:00Z');
      const result = await service.computeSlaDeadlines('MEDIUM', null, baseDate);

      // SLA computation is using UTC math: base.getTime() + days * 86400_000
      // March 9, 2026 12:00 UTC exactly
      expect(result.slaCapaDue).toEqual(new Date('2026-03-09T12:00:00Z'));
    });
  });

  describe('Cron Job markOverdueCapa', () => {
    it('executes accurately exactly on the cron trigger time', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-27T01:00:00Z'));

      await service.markOverdueCapa();

      // Check CAPA update query executed with correct date string
      expect(capaQb.where).toHaveBeenCalledWith('due_date < :today', { today: '2026-07-27' });

      // Check Incident sla update queries executed with exactly 'now'
      expect(incidentQb.andWhere).toHaveBeenCalledWith('sla_response_due < :now', { now: new Date('2026-07-27T01:00:00.000Z') });
    });
  });
});
