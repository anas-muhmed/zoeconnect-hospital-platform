import { Module } from '@nestjs/common';
import { AiPlatformModule } from './ai-platform/ai-platform.module';
// Future imports for Object Repository, Knowledge & Search, Notifications, Integration

/**
 * PlatformServicesModule aggregates reusable business capabilities
 * like AI, Notifications, Storage, and Search.
 */
@Module({
  imports: [
    AiPlatformModule,
  ],
  exports: [
    AiPlatformModule,
  ],
})
export class PlatformServicesModule {}
