import { Controller, Post, Get, Param, Body, Req, UseGuards } from '@nestjs/common';
import { WorkflowEngineService } from '../workflow-engine.service';
import { WorkflowTimelineService } from '../services/workflow-timeline.service';
import { AuthGuard } from '@nestjs/passport'; // Example generic guard

@Controller('workflow')
@UseGuards(AuthGuard('jwt'))
export class WorkflowController {
  constructor(
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly workflowTimelineService: WorkflowTimelineService,
  ) {}

  @Post('instances/:id/actions')
  async executeAction(
    @Param('id') instanceId: string,
    @Body('action') action: string,
    @Req() req: any
  ) {
    // Assuming req.user contains the authenticated user context
    // This simulates standard auth integration
    const userContext = {
      userId: req.user.id,
      roles: req.user.roles || [],
      department: req.user.department,
      team: req.user.team
    };

    return this.workflowEngineService.executeAction(instanceId, action, userContext);
  }

  @Get('instances/:id/timeline')
  async getTimeline(
    @Param('id') instanceId: string,
    @Body('documentTypeId') documentTypeId: string, // Normally fetched implicitly
  ) {
    return this.workflowTimelineService.getTimeline(instanceId, documentTypeId);
  }
}
