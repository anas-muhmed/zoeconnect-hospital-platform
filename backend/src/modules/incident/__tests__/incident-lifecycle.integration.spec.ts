import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { IncidentService } from '../incidents/incident.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { User } from '../../users/entities/user.entity';

describe('Incident Lifecycle (Integration)', () => {
  let app: TestingModule;
  let incidentService: IncidentService;
  let tenantContext: TenantContextStorage;
  let categoryRepo: any;
  let actor: User;
  let catId: string;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    incidentService = app.get<IncidentService>(IncidentService);
    tenantContext = app.get<TenantContextStorage>(TenantContextStorage);
    categoryRepo = app.get('IncidentCategoryRepository');

    actor = new User();
    actor.id = '00000000-0000-0000-0000-000000000001';
    actor.username = 'integration.test';
    actor.fullName = 'Integration Test User';

    const cat = await categoryRepo.findOne({ where: { code: 'PATIENT_SAFETY' } });
    catId = cat?.id ?? '00000000-0000-0000-0000-000000000000';
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should successfully transition an incident from DRAFT to SUBMITTED and ACKNOWLEDGED', async () => {
    await TenantContextStorage.runAsSystem(async () => {
      // 1. Create Incident
      const draft = await incidentService.create({
        categoryId: catId,
        severityCode: 'LOW',
        priorityCode: 'ROUTINE',
        department: 'Emergency',
        incidentDate: new Date().toISOString(),
        description: 'Test integration incident',
        isNearMiss: false,
      } as any, actor);

      expect(draft).toBeDefined();
      expect(draft.status).toBe('DRAFT');

      // 2. Submit Incident
      const submitted = await incidentService.transition(draft.id, 'SUBMITTED', actor);
      expect(submitted.status).toBe('SUBMITTED');

      // 3. Acknowledge Incident
      const ack = await incidentService.transition(draft.id, 'ACKNOWLEDGED', actor);
      expect(ack.status).toBe('ACKNOWLEDGED');
    });
  });
});
