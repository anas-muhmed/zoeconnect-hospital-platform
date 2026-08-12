import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { WorkstationConfig } from './entities/workstation-config.entity';
import { TokenLocation } from '../entities/token-location.entity';
import { TokenCounter } from '../entities/token-counter.entity';

import { WorkstationService } from './workstation.service';
import { WorkstationController } from './workstation.controller';
import { BranchModule } from '../../branch/branch.module';
import { TenantModule } from '../../platform/tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkstationConfig, TokenLocation, TokenCounter]),
    BranchModule,
    // Stage B (Checkpoint B5) — ChainTenantResolver for saveConfig()'s
    // walk-up write.
    TenantModule,
    // Same jwt.secret as every other module minting/verifying tokens (see
    // registration.module.ts's identical pattern for the reservation-
    // capability token) -- JwtStrategy verifies both token types through
    // the same passport 'jwt' strategy.
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers:   [WorkstationService],
  controllers: [WorkstationController],
  exports:     [WorkstationService],
})
export class WorkstationModule {}
