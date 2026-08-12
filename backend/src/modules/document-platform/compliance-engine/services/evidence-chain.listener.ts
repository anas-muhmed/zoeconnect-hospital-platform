import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrityEngineService } from './integrity-engine.service';
import { EvidenceChainEntity, EvidenceOperationType } from '../entities/evidence-chain.entity';

@Injectable()
export class EvidenceChainListener {
  private readonly logger = new Logger(EvidenceChainListener.name);

  constructor(
    @InjectRepository(EvidenceChainEntity)
    private readonly chainRepo: Repository<EvidenceChainEntity>,
    private readonly integrityEngine: IntegrityEngineService
  ) {}

  @OnEvent('evidence.operation_recorded')
  async handleEvidenceRecorded(event: {
    documentInstanceId: string;
    operation: EvidenceOperationType;
    actorId: string;
    payload: Record<string, unknown> | string;
    metadata?: Record<string, unknown>;
  }) {
    const { documentInstanceId, operation, actorId, payload, metadata } = event;

    const payloadHash = this.integrityEngine.hashPayload(payload);

    // Get the previous hash
    const lastLink = await this.chainRepo.findOne({
      where: { documentInstanceId },
      order: { timestamp: 'DESC' },
    });

    const previousHash = lastLink ? lastLink.chainHash : null;
    const timestamp = new Date();
    const chainHash = this.integrityEngine.chainHash(payloadHash, previousHash, timestamp);

    const newLink = this.chainRepo.create({
      documentInstanceId,
      operation,
      actorId,
      payloadHash,
      previousHash,
      chainHash,
      metadata,
      timestamp,
    });

    await this.chainRepo.save(newLink);
    this.logger.log(`Appended evidence block for ${documentInstanceId} [${operation}]`);
  }
}
