import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class WorkflowNotificationListener {
  private readonly logger = new Logger(WorkflowNotificationListener.name);

  @OnEvent('workflow.transitioned')
  handleWorkflowTransitionEvent(payload: any) {
    this.logger.log(
      `[NOTIFICATION STUB] Document ${payload.documentId} v${payload.versionNo} transitioned from ${payload.fromState} to ${payload.toState} by User ${payload.userId}`,
    );
    // In Milestone 6, this will be wired to the NotificationEngine for real email/SMS/in-app delivery.
  }
}
