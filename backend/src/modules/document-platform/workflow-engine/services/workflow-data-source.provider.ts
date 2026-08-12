import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IDataSourceProvider, DataSourceContext } from '../../forms-runtime/execution-context/data-source-provider.interface';
import { ExecutionContextBuilder } from '../../forms-runtime/execution-context/execution-context.builder';
import { WorkflowInstanceEntity } from '../entities/workflow-instance.entity';

@Injectable()
export class WorkflowDataSourceProvider implements IDataSourceProvider, OnModuleInit {
  public readonly namespace = 'workflow';

  constructor(
    private readonly contextBuilder: ExecutionContextBuilder,
    @InjectRepository(WorkflowInstanceEntity)
    private readonly workflowInstanceRepo: Repository<WorkflowInstanceEntity>
  ) {}

  onModuleInit() {
    this.contextBuilder.registerProvider(this);
  }

  async fetchData(context: DataSourceContext): Promise<Record<string, unknown>> {
    if (!context.documentInstanceId) return {};

    const instance = await this.workflowInstanceRepo.findOne({
      where: { documentInstanceId: context.documentInstanceId }
    });

    if (!instance) return {};

    const daysWaiting = instance.startedAt
      ? Math.floor((Date.now() - instance.startedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      currentState: instance.currentState,
      currentAssignee: instance.currentAssignee,
      revisionCount: instance.currentRevision,
      status: instance.status,
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      daysWaiting,
    };
  }
}
