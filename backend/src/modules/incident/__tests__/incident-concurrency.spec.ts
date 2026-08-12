process.env.DB_LOGGING = 'true';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { IncidentService } from '../incidents/incident.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Incident } from '../entities/incident.entity';

describe('Service Level Optimistic Locking', () => {
  let moduleRef: TestingModule;
  let incidentService: IncidentService;
  let incidentRepo: any;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    incidentService = moduleRef.get(IncidentService);
    incidentRepo = moduleRef.get(getRepositoryToken(Incident));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('throws OptimisticLockVersionMismatchError on race condition', async () => {
    await TenantContextStorage.runAsSystem(async () => {
      const catRepo = moduleRef.get('IncidentCategoryRepository');
      const cat = await catRepo.findOne({ where: { code: 'PATIENT_SAFETY' } });
      const inc = await incidentRepo.save(incidentRepo.create({
        tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        categoryId: cat.id,
        incidentNumber: `INC-SVC-${Date.now()}`,
        description: 'SVC Concurrency',
        status: 'DRAFT',
        department: 'Emergency',
        incidentDate: new Date(),
        reporterId: '11111111-1111-1111-1111-111111111111',
        createdById: '11111111-1111-1111-1111-111111111111',
      }));

      // Load two copies (simulating concurrent read)
      const copy1 = await incidentRepo.findOne({ where: { id: inc.id } });
      const copy2 = await incidentRepo.findOne({ where: { id: inc.id } });

      // Modify both
      copy1.description = 'Update 1';
      copy2.description = 'Update 2';

      // Save copy1 (succeeds)
      await incidentRepo.save(copy1);

      // Save copy2 (fails due to version mismatch)
      await expect(incidentRepo.save(copy2)).rejects.toThrow();
      
      await incidentRepo.delete(inc.id);
    });
  });
});

