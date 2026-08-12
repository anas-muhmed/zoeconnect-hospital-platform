import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HospitalsController } from './hospitals.controller';
import { HospitalsService }    from './hospitals.service';
import { Hospital }            from './entities/hospital.entity';
import { LicenseRequest }      from './entities/license-request.entity';
import { IssuedLicense }       from './entities/issued-license.entity';
import { RevocationEvent }     from './entities/revocation-event.entity';
import { HisSchemaConfig }     from './entities/his-schema-config.entity';
import { HisConfigTemplate }   from './entities/his-config-template.entity';
import { HospitalSetting }     from './entities/hospital-setting.entity';
import { HdspUser }            from './entities/hdsp-user.entity';
import { PasswordReset }       from './entities/password-reset.entity';
import { CloudTenant }         from '../cloud-tenants/entities/cloud-tenant.entity';
import { SigningService }      from '../signing/signing.service';
import { WebhookService }      from '../webhook/webhook.service';
import { AuthModule }          from '../auth/auth.module';

@Module({
  imports: [
    // Cloud Licensing API (2026-07-29) -- CloudTenant added so
    // HospitalsService.approveRequest() can read hdspTenantId/instanceSecret
    // for a cloud request's linked tenant. Same "inject the entity
    // directly, no module import" pattern CloudTenantsService already uses
    // for Hospital (see cloud-tenants.module.ts's own doc comment) -- avoids
    // a circular HospitalsModule <-> CloudTenantsModule dependency.
    TypeOrmModule.forFeature([Hospital, LicenseRequest, IssuedLicense, RevocationEvent, HisSchemaConfig, HisConfigTemplate, HospitalSetting, HdspUser, PasswordReset, CloudTenant]),
    AuthModule,
  ],
  controllers: [HospitalsController],
  providers:   [HospitalsService, SigningService, WebhookService],
  exports:     [HospitalsService],
})
export class HospitalsModule {}

