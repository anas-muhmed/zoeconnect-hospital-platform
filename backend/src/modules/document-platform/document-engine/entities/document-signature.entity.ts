import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A captured handwritten signature (ADR — Phase 2 §6 signature subsystem, v1
 * handwritten-only, behind an ISignatureProvider interface added in Milestone 7).
 * Milestone 1 ships schema only.
 */
@Entity('document_signatures')
export class DocumentSignatureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId: string;

  @Column({ name: 'field_key', length: 100 })
  fieldKey: string;

  @Column({ name: 'signature_vector', type: 'jsonb' })
  signatureVector: unknown;

  @Column({ name: 'signer_role', length: 30 })
  signerRole: string;

  @Column({ name: 'signed_by_user_id', type: 'uuid', nullable: true })
  signedByUserId: string | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'integrity_hash', length: 128 })
  integrityHash: string;

  @CreateDateColumn({ name: 'signed_at' })
  signedAt: Date;
}
