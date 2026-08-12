import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentSignatureEntity, SignatureType, SignatureIntent } from '../entities/document-signature.entity';
import { IntegrityEngineService } from './integrity-engine.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface SignatureCaptureParams {
  documentInstanceId: string;
  actorId: string;
  actorName: string;
  signatureType: SignatureType;
  intent: SignatureIntent;
  payload: string;
  ipAddress?: string;
  deviceInfo?: string;
}

@Injectable()
export class SignatureFrameworkService {
  private readonly logger = new Logger(SignatureFrameworkService.name);

  constructor(
    @InjectRepository(DocumentSignatureEntity)
    private readonly signatureRepo: Repository<DocumentSignatureEntity>,
    private readonly integrityEngine: IntegrityEngineService,
    private readonly eventEmitter: EventEmitter2
  ) { }

  /**
   * Captures a signature, validates its integrity, and stores it securely.
   */
  async captureSignature(params: SignatureCaptureParams): Promise<DocumentSignatureEntity> {
    // Generate a cryptographic hash of the signature payload itself
    const payloadHash = this.integrityEngine.hashPayload(params.payload);

    const signature = this.signatureRepo.create({
      documentInstanceId: params.documentInstanceId,
      actorId: params.actorId,
      actorName: params.actorName,
      signatureType: params.signatureType,
      intent: params.intent,
      payload: params.payload,
      payloadHash,
      ipAddress: params.ipAddress,
      deviceInfo: params.deviceInfo,
    });

    const saved = await this.signatureRepo.save(signature);

    this.logger.log(`Signature captured for document ${params.documentInstanceId} by ${params.actorName} [${params.intent}]`);

    // Emit event to be appended to the Evidence Chain
    this.eventEmitter.emit('evidence.operation_recorded', {
      documentInstanceId: params.documentInstanceId,
      operation: 'SIGNED',
      actorId: params.actorId,
      payload: { signatureId: saved.id, payloadHash, intent: params.intent },
    });

    return saved;
  }
}
