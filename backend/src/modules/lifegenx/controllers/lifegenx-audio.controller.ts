import {
  BadRequestException, Controller, Get, Param, Post, Request, Res, UseGuards, UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { LifeGenXAudioService } from '../services/lifegenx-audio.service';

/**
 * LifeGenX integration (delivery phase). Ports `controllers/audio.controller.ts`.
 * Uses Fastify's multipart `req.file()`, same pattern as `CmsMediaController.upload`.
 *
 * Security fix (whole-system audit, Step 10): audio retrieval used to be
 * an unauthenticated static file mount (`/uploads/lifegenx-audio/...`,
 * removed from `main.ts`). It's now this controller's own `download`
 * route — same guard chain as every other LifeGenX endpoint, plus an
 * explicit tenant-ownership check in `LifeGenXAudioService.retrieve()`.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('lifegenx/audio')
export class LifeGenXAudioController {
  constructor(private readonly audioService: LifeGenXAudioService) {}

  @Post('upload')
  @RequirePermissions('LIFEGENX:AUDIO:UPLOAD')
  async upload(@Request() req: any, @CurrentUser() user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const data = await req.file();
    if (!data) throw new BadRequestException('No audio file uploaded');

    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    for await (const chunk of data.file as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return this.audioService.store(buffer, data.filename as string, data.mimetype as string, user.tenantId);
  }

  @Get(':tenantId/:filename')
  @RequirePermissions('LIFEGENX:AUDIO:UPLOAD')
  async download(
    @Param('tenantId') tenantId: string,
    @Param('filename') filename: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } = await this.audioService.retrieve(tenantId, user.tenantId, filename);
    // Fastify's reply shares `.header()`/`.send()` with Express's Response
    // (see IncidentAttachmentController.download for the same pattern) --
    // `.set()`/`.end()` are Express-only and throw on this app's adapter.
    res.header('Content-Type', mimeType);
    res.header('Content-Length', String(buffer.length));
    res.send(buffer);
  }
}
