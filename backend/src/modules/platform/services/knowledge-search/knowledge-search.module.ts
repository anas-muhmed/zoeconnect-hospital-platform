import { Module } from '@nestjs/common';
import { KnowledgePlatformService } from './services/knowledge-platform.service';

@Module({
  providers: [KnowledgePlatformService],
  exports: [KnowledgePlatformService],
})
export class KnowledgeSearchModule {}
