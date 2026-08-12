import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalAdminController } from './vendor-gateway.controller';
import { VendorGatewayService } from './vendor-gateway.service';
import { Hospital } from '../hospitals/entities/hospital.entity';
import { PasswordReset } from '../hospitals/entities/password-reset.entity';
import { CloudTenant } from '../cloud-tenants/entities/cloud-tenant.entity';
import { SigningService } from '../signing/signing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Hospital, PasswordReset, CloudTenant]),
  ],
  controllers: [GlobalAdminController],
  providers: [VendorGatewayService, SigningService],
  exports: [VendorGatewayService],
})
export class VendorGatewayModule {}

