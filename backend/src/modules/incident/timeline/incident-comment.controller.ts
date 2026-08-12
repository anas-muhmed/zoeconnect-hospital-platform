import { Controller, Get, Post, Param, Body, UseGuards, UseInterceptors, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { LicenseGuard } from '../../licensing/license.guard';
import { RequireModule } from '../../licensing/decorators/require-module.decorator';
import { TenantContextInterceptor } from '../../platform/tenant/context/tenant-context.interceptor';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { IncidentCommentService } from './incident-comment.service';
import { CreateIncidentCommentDto } from '../dto/incident-comment.dto';
import type { User } from '../../users/entities/user.entity';

@ApiTags('Incident Comments')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard, LicenseGuard)
@RequireModule('INCIDENT')
@UseInterceptors(TenantContextInterceptor)
@Controller('incident/:incidentId/comments')
export class IncidentCommentController {
  constructor(private readonly commentService: IncidentCommentService) {}

  @Post()
  @RequirePermissions('INCIDENT:INCIDENTS:UPDATE')
  @ApiOperation({ summary: 'Add a new comment/note to an incident' })
  addComment(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateIncidentCommentDto,
    @CurrentUser() actor: User,
  ) {
    return this.commentService.addComment(incidentId, dto, actor);
  }

  @Get()
  @RequirePermissions('INCIDENT:INCIDENTS:READ')
  @ApiOperation({ summary: 'List all comments for an incident' })
  getComments(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.commentService.getComments(incidentId);
  }
}
