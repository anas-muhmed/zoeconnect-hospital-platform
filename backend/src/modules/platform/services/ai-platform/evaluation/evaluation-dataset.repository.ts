import { Injectable, Logger } from '@nestjs/common';
import { EvaluationDatasetEntity } from './entities/evaluation-dataset.entity';
import { AiCapabilityType } from '../interfaces/ai-capability.interface';

@Injectable()
export class EvaluationDatasetRepository {
  private readonly logger = new Logger(EvaluationDatasetRepository.name);
  private datasets = new Map<string, EvaluationDatasetEntity>();

  save(dataset: EvaluationDatasetEntity): void {
    this.datasets.set(dataset.id, dataset);
    this.logger.log(`Saved Evaluation Dataset: ${dataset.name}`);
  }

  findById(id: string): EvaluationDatasetEntity | undefined {
    return this.datasets.get(id);
  }

  findByCapability(capability: AiCapabilityType): EvaluationDatasetEntity[] {
    return Array.from(this.datasets.values()).filter(d => d.capability === capability);
  }
}
