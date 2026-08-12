import { Module }          from '@nestjs/common';
import { TypeOrmModule }   from '@nestjs/typeorm';
import { ReportsService }  from './reports.service';
import { ReportsController } from './reports.controller';
import { LoyaltyAccount }    from '../loyalty/entities/loyalty-account.entity';
import { LoyaltyTransaction } from '../loyalty/entities/loyalty-transaction.entity';
import { Campaign }          from '../loyalty/entities/campaign.entity';
import { NotificationLog }   from '../notifications/entities/notification-log.entity';
import { LicensingModule }   from '../licensing/license.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LoyaltyAccount,
      LoyaltyTransaction,
      Campaign,
      NotificationLog,
    ]),
    LicensingModule,
  ],
  controllers: [ReportsController],
  providers:   [ReportsService],
  exports:     [ReportsService],
})
export class ReportsModule {}
