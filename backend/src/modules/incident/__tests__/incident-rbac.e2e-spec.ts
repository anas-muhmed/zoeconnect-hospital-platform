import { ExecutionContext, Injectable, CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../app.module';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

@Injectable()
export class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role = req.headers['x-mock-role'] || 'ADMIN';
    const tenantId = req.headers['x-mock-tenant'] || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const userId = req.headers['x-mock-user-id'] || '11111111-1111-1111-1111-111111111111';

    req.user = {
      id: userId,
      username: 'e2e-user',
      tenantId,
      sessionTenantId: tenantId,
      isSuperAdmin: role === 'SUPER_ADMIN',
      hasPermission: (perm: string) => {
        if (role === 'ADMIN') return true;
        if (role === 'REPORTER') {
          return perm === 'INCIDENT:INCIDENTS:CREATE' || perm === 'INCIDENT:INCIDENTS:READ';
        }
        if (role === 'INVESTIGATOR') {
          return perm === 'INCIDENT:INCIDENTS:READ' || 
                 perm === 'INCIDENT:INCIDENTS:UPDATE' ||
                 perm === 'INCIDENT:INVESTIGATION:READ' ||
                 perm === 'INCIDENT:INVESTIGATION:UPDATE' ||
                 perm === 'INCIDENT:RCA:UPDATE' ||
                 perm === 'INCIDENT:CAPA:UPDATE';
        }
        return false;
      }
    };
    return true;
  }
}

describe('Incident RBAC & Tenant Isolation (E2E)', () => {
  jest.setTimeout(60000); // E2E bootstrap takes longer than 5s
  let app: INestApplication;
  let catId: string;
  let incidentTenantA: string;
  let incidentTenantB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Seed dummy category
    const categoryRepo = app.get('IncidentCategoryRepository');
    const cat = await categoryRepo.findOne({ where: { code: 'PATIENT_SAFETY' } });
    catId = cat?.id ?? '00000000-0000-0000-0000-000000000000';

    // Seed Incidents manually for Tenant A and Tenant B using System context
    const incidentRepo = app.get('IncidentRepository');
    await TenantContextStorage.runAsSystem(async () => {
      const a = await incidentRepo.save(incidentRepo.create({
        tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        categoryId: catId,
        incidentNumber: `INC-A-${Date.now()}`,
        description: 'Tenant A Incident',
        status: 'DRAFT',
        incidentDate: new Date(),
        department: 'Emergency',
        reporterId: '11111111-1111-1111-1111-111111111111',
        createdById: '11111111-1111-1111-1111-111111111111',
      }));
      incidentTenantA = a.id;

      const b = await incidentRepo.save(incidentRepo.create({
        tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        categoryId: catId,
        incidentNumber: `INC-B-${Date.now()}`,
        description: 'Tenant B Incident',
        status: 'DRAFT',
        incidentDate: new Date(),
        department: 'Emergency',
        reporterId: '11111111-1111-1111-1111-111111111111',
        createdById: '11111111-1111-1111-1111-111111111111',
      }));
      incidentTenantB = b.id;
    });
  });

  afterAll(async () => {
    // Cleanup records
    const incidentRepo = app.get('IncidentRepository');
    await TenantContextStorage.runAsSystem(async () => {
      await incidentRepo.delete([incidentTenantA, incidentTenantB]);
    });
    await app.close();
  });

  describe('Tenant Isolation', () => {
    it('Tenant A should not see Tenant B incident', async () => {
      const res = await request(app.getHttpServer())
        .get(`/incident/${incidentTenantB}`)
        .set('x-mock-tenant', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        .set('x-mock-role', 'ADMIN');

      // Assert consistent enumeration protection (404 instead of 403)
      expect(res.status).toBe(404);
    });

    it('Tenant B should not see Tenant A incident', async () => {
      const res = await request(app.getHttpServer())
        .get(`/incident/${incidentTenantA}`)
        .set('x-mock-tenant', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
        .set('x-mock-role', 'ADMIN');

      expect(res.status).toBe(404);
    });

    it('List endpoints should only return tenant-scoped records', async () => {
      const res = await request(app.getHttpServer())
        .get(`/incident`)
        .set('x-mock-tenant', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        .set('x-mock-role', 'ADMIN');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      res.body.data.forEach((inc: any) => {
        expect(inc.tenantId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        expect(inc.id).not.toBe(incidentTenantB);
      });
    });
  });

  describe('RBAC Matrix', () => {
    it('Reporter can CREATE an incident', async () => {
      const res = await request(app.getHttpServer())
        .post('/incident')
        .set('x-mock-tenant', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        .set('x-mock-role', 'REPORTER')
        .send({
          categoryId: catId,
          severityCode: 'LOW',
          priorityCode: 'ROUTINE',
          department: 'Emergency',
          incidentDate: new Date().toISOString(),
          description: 'Reporter created incident',
          isNearMiss: false,
        });

      expect(res.status).toBe(201);
      
      // Cleanup
      const incidentRepo = app.get('IncidentRepository');
      await TenantContextStorage.runAsSystem(async () => {
        await incidentRepo.delete(res.body.id);
      });
    });

    it('Reporter CANNOT delete an incident', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/incident/${incidentTenantA}`)
        .set('x-mock-tenant', 'tenant-a')
        .set('x-mock-role', 'REPORTER');

      expect(res.status).toBe(403);
    });

    it('Investigator can READ and UPDATE', async () => {
      const resGet = await request(app.getHttpServer())
        .get(`/incident/${incidentTenantA}`)
        .set('x-mock-tenant', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        .set('x-mock-role', 'INVESTIGATOR');
      expect(resGet.status).toBe(200);

      const resPatch = await request(app.getHttpServer())
        .patch(`/incident/${incidentTenantA}`)
        .set('x-mock-tenant', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        .set('x-mock-role', 'INVESTIGATOR')
        .send({ description: 'Updated by investigator' });
      expect(resPatch.status).toBe(200);
    });

    it('Investigator CANNOT close an incident (missing perm)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/incident/${incidentTenantA}/close`)
        .set('x-mock-tenant', 'tenant-a')
        .set('x-mock-role', 'INVESTIGATOR')
        .send({ closureNotes: 'Closing now' });

      expect(res.status).toBe(403);
    });
  });
});
