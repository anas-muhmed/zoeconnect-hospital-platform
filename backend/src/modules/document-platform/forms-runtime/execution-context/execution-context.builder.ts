import { Injectable } from '@nestjs/common';
import { IDataSourceProvider, DataSourceContext } from './data-source-provider.interface';
import { DocumentInstanceEntity } from '../../document-engine/entities/document-instance.entity';

export interface ExecutionContext {
  formData: Record<string, unknown>;
  variables: Record<string, unknown>;
}

@Injectable()
export class ExecutionContextBuilder {
  private providers: IDataSourceProvider[] = [];

  registerProvider(provider: IDataSourceProvider) {
    this.providers.push(provider);
  }

  async buildContext(instance: DocumentInstanceEntity): Promise<ExecutionContext> {
    const dataSourceContext: DataSourceContext = {
      documentInstanceId: instance.id,
      patientId: instance.patientId,
      visitId: instance.visitId,
      encounterId: instance.encounterId,
      branchId: instance.branchId,
      departmentCode: instance.departmentCode,
    };

    const variables: Record<string, unknown> = {};

    for (const provider of this.providers) {
      try {
        const data = await provider.fetchData(dataSourceContext);
        variables[provider.namespace] = data;
      } catch (err) {
        // Log error but don't fail the entire context build
        console.error(`Failed to fetch data from provider ${provider.namespace}`, err);
        variables[provider.namespace] = {};
      }
    }

    return {
      formData: instance.answers || {},
      variables,
    };
  }
}
