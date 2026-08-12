import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type SignatureType = 'DRAWN' | 'TYPED' | 'UPLOADED' | 'SMART_CARD' | 'CERTIFICATE';
export type SignatureIntent = 'AUTHOR' | 'REVIEWER' | 'WITNESS' | 'PATIENT_CONSENT';

@Entity('hdsp_document_signatures')
export class DocumentSignatureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'document_instance_id', type: 'uuid' })
  documentInstanceId: string;

  @Column({ name: 'actor_id', type: 'varchar', length: 100 })
  actorId: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 255 })
  actorName: string;

  @Column({ name: 'signature_type', type: 'varchar', length: 50 })
  signatureType: SignatureType;

  @Column({ name: 'signature_intent', type: 'varchar', length: 50 })
  intent: SignatureIntent;

  // The actual signature payload (e.g. base64 image for DRAWN, text for TYPED, cert thumbprint for CERTIFICATE)
  @Column({ name: 'payload', type: 'text' })
  payload: string;

  // Cryptographic hash of the signature payload itself, to ensure it hasn't been altered
  @Column({ name: 'payload_hash', type: 'varchar', length: 128, nullable: true })
  payloadHash: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'device_info', type: 'varchar', length: 255, nullable: true })
  deviceInfo: string | null;

  @CreateDateColumn({ name: 'signed_at' })
  signedAt: Date;
}
