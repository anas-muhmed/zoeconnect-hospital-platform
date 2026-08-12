import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });
import { Hospital }         from '../modules/hospitals/entities/hospital.entity';
import { LicenseRequest }   from '../modules/hospitals/entities/license-request.entity';
import { IssuedLicense }    from '../modules/hospitals/entities/issued-license.entity';
import { RevocationEvent }  from '../modules/hospitals/entities/revocation-event.entity';
import { VendorUser }       from '../modules/auth/entities/vendor-user.entity';
import { PasswordReset }    from '../modules/hospitals/entities/password-reset.entity';
import { HisSchemaConfig }  from '../modules/hospitals/entities/his-schema-config.entity';
import { HisConfigTemplate } from '../modules/hospitals/entities/his-config-template.entity';
import { HdspUser }         from '../modules/hospitals/entities/hdsp-user.entity';
import { HospitalSetting }  from '../modules/hospitals/entities/hospital-setting.entity';
import { CloudTenant }      from '../modules/cloud-tenants/entities/cloud-tenant.entity';

export const AppDataSource = new DataSource({
  type:        'postgres',
  host:        process.env.DB_HOST     ?? 'localhost',
  port:        parseInt(process.env.DB_PORT ?? '5433'),
  username:    process.env.DB_USER     ?? 'vendor_app',
  password:    process.env.DB_PASS     ?? 'vendor_secret',
  database:    process.env.DB_NAME     ?? 'vendor_db',
  synchronize: true,
  logging:     process.env.NODE_ENV === 'development',
  entities:    [Hospital, LicenseRequest, IssuedLicense, RevocationEvent, VendorUser, PasswordReset, HisSchemaConfig, HisConfigTemplate, HdspUser, HospitalSetting, CloudTenant],
  migrations:  [__dirname + '/../database/migrations/*.{ts,js}'],
});

