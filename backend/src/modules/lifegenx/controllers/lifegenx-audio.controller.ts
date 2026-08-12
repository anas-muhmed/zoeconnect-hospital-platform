import { BadRequestException, Controller, Post, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { LifeGenXAudioService } from '../services/lifegenx-audio.service';

/** LifeGenX integration (delivery phase). Ports `controllers/audio.controller.ts`. Uses Fastify's multipart `req.file()`, same pattern as `CmsMediaController.upload`. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('lifegenx/audio')
export class LifeGenXAudioController {
  constructor(
    private readonly audioService: LifeGenXAudioService,
    private readonly tenantContext: TenantContextStorage,
  ) {}

  @Post('upload')
  @RequirePermissions('LIFEGENX:AUDIO:UPLOAD')
  async upload(@Request() req: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const data = await req.file();
    if (!data) throw new BadRequestException('No audio file uploaded');

    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    for await (const chunk of data.file as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return this.audioService.store(buffer, data.filename as string, data.mimetype as string, tenantId);
  }
}
