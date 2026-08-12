import { Injectable } from '@nestjs/common';
import { ISignatureProvider, SignatureCaptureContext, SignatureValidationResult } from './signature-provider.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentSignatureEntity } from '../entities/document-signature.entity';
import * as crypto from 'crypto';

@Injectable()
export class DefaultSignatureProvider implements ISignatureProvider {
  constructor(
    @InjectRepository(DocumentSignatureEntity)
    private readonly signatureRepo: Repository<DocumentSignatureEntity>,
  ) {}

  async captureSignature(payload: string, ctx: SignatureCaptureContext): Promise<string> {
    // Generate a hash representing the signature and the context
    const integrityHash = crypto
      .createHash('sha256')
      .update(`${payload}:${ctx.instanceId}:${ctx.fieldKey}`)
      .digest('hex');

    const entity = this.signatureRepo.create({
      instanceId: ctx.instanceId,
      fieldKey: ctx.fieldKey,
      signatureVector: { payload },
      signerRole: ctx.signerRole,
      signedByUserId: ctx.signedByUserId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      integrityHash,
    });

    await this.signatureRepo.save(entity);
    return integrityHash;
  }

  async validateSignature(hash: string, ctx: Omit<SignatureCaptureContext, 'ipAddress' | 'userAgent'>): Promise<SignatureValidationResult> {
    const signature = await this.signatureRepo.findOne({
      where: { instanceId: ctx.instanceId, fieldKey: ctx.fieldKey, integrityHash: hash },
    });

    if (!signature) {
      return { valid: false, signerHash: '' };
    }

    return { valid: true, signerHash: signature.integrityHash };
  }
}
