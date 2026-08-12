import {
  Controller, Get, Post, Delete, Param, UseInterceptors,
  UseGuards, ParseUUIDPipe, Res, Request, BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/entities/user.entity';
import { IncidentAttachmentService } from './incident-attachment.service';

@ApiTags('Incident Attachments')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/attachments')
export class IncidentAttachmentController {
  constructor(private readonly service: IncidentAttachmentService) {}

  @Post(':incidentId/:parentType/:parentId')
  @RequirePermissions('INCIDENT:INCIDENTS:UPDATE')
  @ApiOperation({ summary: 'Upload an attachment to an incident, investigation, or CAPA' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  async upload(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Param('parentType') parentType: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
    @Request() req: any,
    @CurrentUser() actor: User,
  ) {
    const data = await req.file();
    if (!data) throw new BadRequestException('No file received');

    const chunks: Buffer[] = [];
    for await (const chunk of data.file as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    const file = {
      buffer: fileBuffer,
      mimetype: data.mimetype,
      originalname: data.filename,
      size: fileBuffer.length,
    } as Express.Multer.File;

    return this.service.upload(incidentId, parentType.toUpperCase(), parentId, file, actor);
  }

  @Get('incident/:incidentId')
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'Get all attachments for an incident' })
  getForIncident(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.service.getForIncident(incidentId);
  }

  @Get('parent/:parentType/:parentId')
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'Get attachments for a specific sub-record (e.g. CAPA)' })
  getForParent(
    @Param('parentType') parentType: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
  ) {
    return this.service.getForParent(parentType.toUpperCase(), parentId);
  }

  @Get(':id/download')
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'Download file directly (buffered stream)' })
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, mimeType, originalName } = await this.service.download(id);
    // @Res() is typed against express.Response for convenience, but this app
    // runs on @nestjs/platform-fastify — Fastify's reply object does not have
    // Express's `.set(object)` / `.end(buffer)` (throws "res.set is not a
    // function" at runtime). `.header(key, value)` and `.send()` are the two
    // methods both Express's Response and Fastify's Reply actually share.
    res.header('Content-Type', mimeType);
    res.header('Content-Disposition', `attachment; filename="${originalName}"`);
    res.header('Content-Length', String(buffer.length));
    res.send(buffer);
  }

  @Get(':id/presigned')
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'Get a temporary pre-signed URL for direct cloud download' })
  getPresignedUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPresignedUrl(id);
  }

  @Delete(':id')
  @RequirePermissions('INCIDENT:INCIDENTS:UPDATE')
  @ApiOperation({ summary: 'Delete an attachment' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.service.delete(id, actor);
  }
}
