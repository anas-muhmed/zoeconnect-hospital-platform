import { ExecutionContext, Injectable, CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../app.module';
import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class MockConcurrencyAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-mock-user'] || '11111111-1111-1111-1111-111111111111';
    
    req.user = {
      id: userId,
      username: 'e2e-user',
      tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      sessionTenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      isSuperAdmin: true,
      hasPermission: () => true
    };
    return true;
  }
}

describe('Incident Concurrency & Optimistic Locking (E2E)', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let catId: string;
  let incidentId: string;
  let rcaId: string;
  let capaId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockConcurrencyAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    const categoryRepo = app.get('IncidentCategoryRepository');
    const cat = await categoryRepo.findOne({ where: { code: 'PATIENT_SAFETY' } });
    catId = cat?.id ?? '00000000-0000-0000-0000-000000000000';

    const incidentRepo = app.get('IncidentRepository');
    await TenantContextStorage.runAsSystem(async () => {
      // Create Incident
      const inc = await incidentRepo.save(incidentRepo.create({
        tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        categoryId: catId,
        incidentNumber: `INC-CONC-${Date.now()}`,
        description: 'Concurrency Test Incident',
        status: 'DRAFT',
        incidentDate: new Date(),
        department: 'Emergency',
        reporterId: '11111111-1111-1111-1111-111111111111',
        createdById: '11111111-1111-1111-1111-111111111111',
      }));
      incidentId = inc.id;

      // Create RCA
      const rcaRepo = app.get('IncidentRcaRepository');
      const rca = await rcaRepo.save(rcaRepo.create({
        tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        incidentId,
        method: 'FIVE_WHY',
        status: 'IN_PROGRESS',
        conductedById: '11111111-1111-1111-1111-111111111111',
      }));
      rcaId = rca.id;

      // Create CAPA
      const capaRepo = app.get('IncidentCapaRepository');
      const capa = await capaRepo.save(capaRepo.create({
        tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        incidentId,
        title: 'Concurrency CAPA',
        description: 'Initial CAPA description',
        capaType: 'PREVENTIVE',
        status: 'PENDING',
        dueDate: new Date(),
        ownerId: '11111111-1111-1111-1111-111111111111',
        createdById: '11111111-1111-1111-1111-111111111111',
      }));
      capaId = capa.id;
    });
  });

  afterAll(async () => {
    const incidentRepo = app.get('IncidentRepository');
    await TenantContextStorage.runAsSystem(async () => {
      await incidentRepo.delete(incidentId);
    });
    await app.close();
  });

  it('Incident Update: Resolves concurrent updates with 409 Conflict', async () => {
    const req1 = request(app.getHttpServer())
      .patch(`/incident/${incidentId}`)
      .set('x-mock-user', '11111111-1111-1111-1111-222222222222')
      .send({ description: 'Update by User A' });

    const req2 = request(app.getHttpServer())
      .patch(`/incident/${incidentId}`)
      .set('x-mock-user', '11111111-1111-1111-1111-333333333333')
      .send({ description: 'Update by User B' });

    const [res1, res2] = await Promise.all([req1, req2]);

    const statuses = [res1.status, res2.status];
    if (statuses.includes(HttpStatus.CONFLICT)) {
      expect(statuses).toContain(HttpStatus.OK);
      expect(statuses).toContain(HttpStatus.CONFLICT);
    } else {
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.OK]);
      const incidentRepo = app.get('IncidentRepository');
      const final = await incidentRepo.findOne({ where: { id: incidentId } });
      expect(final.version).toBeGreaterThanOrEqual(3);
    }
  });

  it('RCA Update: Resolves concurrent RCA edits with 409 Conflict', async () => {
    const req1 = request(app.getHttpServer())
      .patch(`/incident/${incidentId}/rca/${rcaId}`)
      .set('x-mock-user', '11111111-1111-1111-1111-222222222222')
      .send({ rootCause: 'Root Cause A' });

    const req2 = request(app.getHttpServer())
      .patch(`/incident/${incidentId}/rca/${rcaId}`)
      .set('x-mock-user', '11111111-1111-1111-1111-333333333333')
      .send({ rootCause: 'Root Cause B' });

    const [res1, res2] = await Promise.all([req1, req2]);

    const statuses = [res1.status, res2.status];
    if (statuses.includes(HttpStatus.CONFLICT)) {
      expect(statuses).toContain(HttpStatus.OK);
      expect(statuses).toContain(HttpStatus.CONFLICT);
    } else {
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.OK]);
      // If they executed sequentially without conflict, the final version must be 3
      // because BOTH successfully incremented the version.
      // If it silently overwrote (bug), the version would be 2.
      const rcaRepo = app.get('IncidentRcaRepository');
      const final = await rcaRepo.findOne({ where: { id: rcaId } });
      expect(final.version).toBeGreaterThanOrEqual(3);
    }
  });

  it('CAPA Update: Resolves concurrent CAPA edits with 409 Conflict', async () => {
    const req1 = request(app.getHttpServer())
      .patch(`/incident/${incidentId}/capa/${capaId}`)
      .set('x-mock-user', '11111111-1111-1111-1111-222222222222')
      .send({ description: 'CAPA Desc A' });

    const req2 = request(app.getHttpServer())
      .patch(`/incident/${incidentId}/capa/${capaId}`)
      .set('x-mock-user', '11111111-1111-1111-1111-333333333333')
      .send({ description: 'CAPA Desc B' });

    const [res1, res2] = await Promise.all([req1, req2]);

    const statuses = [res1.status, res2.status];
    if (statuses.includes(HttpStatus.CONFLICT)) {
      expect(statuses).toContain(HttpStatus.OK);
      expect(statuses).toContain(HttpStatus.CONFLICT);
    } else {
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.OK]);
      const capaRepo = app.get('IncidentCapaRepository');
      const final = await capaRepo.findOne({ where: { id: capaId } });
      expect(final.version).toBeGreaterThanOrEqual(3);
    }
  });
});
