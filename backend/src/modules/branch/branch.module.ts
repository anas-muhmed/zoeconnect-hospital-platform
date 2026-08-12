import { Module } from '@nestjs/common';
import { BranchService } from './branch.service';
import { BranchController } from './branch.controller';
import { HisModule } from '../his/his.module';
import { RedisProvider } from '../../common/redis/redis.provider';

@Module({
  imports: [HisModule],
  controllers: [BranchController],
  providers: [BranchService, RedisProvider],
  exports: [BranchService],
})
export class BranchModule {}
