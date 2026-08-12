import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Hospital }        from './modules/hospitals/entities/hospital.entity';
import { LicenseRequest }  from './modules/hospitals/entities/license-request.entity';
import { IssuedLicense }   from './modules/hospitals/entities/issued-license.entity';
import { RevocationEvent }  from './modules/hospitals/entities/revocation-event.entity';
import { HisSchemaConfig }  from './modules/hospitals/entities/his-schema-config.entity';
import { HisConfigTemplate } from './modules/hospitals/entities/his-config-template.entity';
import { HdspUser }         from './modules/hospitals/entities/hdsp-user.entity';
import { VendorUser }       from './modules/auth/entities/vendor-user.entity';
import { PasswordReset }    from './modules/hospitals/entities/password-reset.entity';
import { HospitalSetting }  from './modules/hospitals/entities/hospital-setting.entity';
import { CloudTenant }      from './modules/cloud-tenants/entities/cloud-tenant.entity';
import { EmailOtpVerification } from './modules/public-signup/entities/email-otp-verification.entity';
import { AuthModule }      from './modules/auth/auth.module';
import { HospitalsModule } from './modules/hospitals/hospitals.module';
import { VendorGatewayModule } from './modules/vendor-gateway/vendor-gateway.module';
import { CloudTenantsModule } from './modules/cloud-tenants/cloud-tenants.module';
import { PublicSignupModule } from './modules/public-signup/public-signup.module';
import { HealthModule } from './modules/health/health.module';
@Module({
  imports: [
    HealthModule,
    TypeOrmModule.forRoot({
      type:        'postgres',
      host:        process.env.DB_HOST     ?? 'localhost',
      port:        parseInt(process.env.DB_PORT ?? '5433'),
      username:    process.env.DB_USER     ?? 'vendor_app',
      password:    process.env.DB_PASS     ?? 'vendor_secret',
      database:    process.env.DB_NAME     ?? 'vendor_db',
      synchronize: true,
      logging:     process.env.NODE_ENV === 'development',
      entities:    [Hospital, LicenseRequest, IssuedLicense, RevocationEvent, HisSchemaConfig, HisConfigTemplate, HdspUser, VendorUser, PasswordReset, HospitalSetting, CloudTenant, EmailOtpVerification],
    }),
    AuthModule,
    HospitalsModule,
    VendorGatewayModule,
    CloudTenantsModule,
    PublicSignupModule,
  ],
})
export class AppModule {}

