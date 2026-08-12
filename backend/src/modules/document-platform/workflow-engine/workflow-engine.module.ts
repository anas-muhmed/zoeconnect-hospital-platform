import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowTemplateEntity } from './entities/workflow-template.entity';
import { WorkflowTaskEntity } from './entities/workflow-task.entity';
import { WorkflowInstanceEntity } from './entities/workflow-instance.entity';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowNotificationListener } from './listeners/workflow-notification.listener';
import { DocumentInstanceEntity } from '../document-engine/entities/document-instance.entity';
import { DocumentVersionEntity } from '../document-engine/entities/document-version.entity';

import { TaskEngineService } from './services/task-engine.service';
import { WorkflowTimelineService } from './services/workflow-timeline.service';
import { WorkflowController } from './controllers/workflow.controller';
import { WorkflowDataSourceProvider } from './services/workflow-data-source.provider';
import { ExecutionContextBuilder } from '../forms-runtime/execution-context/execution-context.builder';
import { DocumentInstanceService } from '../document-engine/services/document-instance.service';
import { DocumentAuditTrailEntity } from '../document-engine/entities/document-audit-trail.entity';
import { DocumentEngineModule } from '../document-engine/document-engine.module';
import { FormsRuntimeModule } from '../forms-runtime/forms-runtime.module';

@Module({
  imports: [
    forwardRef(() => DocumentEngineModule),
    forwardRef(() => FormsRuntimeModule),
    TypeOrmModule.forFeature([
      WorkflowTemplateEntity,
      WorkflowTaskEntity,
      WorkflowInstanceEntity,
      DocumentInstanceEntity,
      DocumentAuditTrailEntity,
      DocumentVersionEntity
    ]),
  ],
  controllers: [WorkflowController],
  providers: [
    WorkflowEngineService, 
    TaskEngineService, 
    WorkflowTimelineService,
    WorkflowDataSourceProvider,
    WorkflowNotificationListener,
    // Note: Assuming ExecutionContextBuilder and DocumentInstanceService are exported from their respective modules 
    // and imported via their modules, but we might need to import their modules here instead of providers.
  ],
  exports: [WorkflowEngineService, TaskEngineService, WorkflowTimelineService],
})
export class WorkflowEngineModule {}
