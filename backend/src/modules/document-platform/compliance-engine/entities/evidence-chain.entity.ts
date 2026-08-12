import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type EvidenceOperationType = 
  | 'CREATED' 
  | 'SNAPSHOT_CAPTURED' 
  | 'SIGNED' 
  | 'PDF_RENDERED' 
  | 'ARCHIVED' 
  | 'EXPORTED';

@Entity('hdsp_document_evidence_chain')
export class EvidenceChainEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'document_instance_id', type: 'uuid' })
  documentInstanceId: string;

  @Column({ name: 'operation', type: 'varchar', length: 50 })
  operation: EvidenceOperationType;

  @Column({ name: 'actor_id', type: 'varchar', length: 100 })
  actorId: string;

  // The cryptographically secure hash of the payload for this event (e.g. hash of the PDF or JSON snapshot)
  @Column({ name: 'payload_hash', type: 'varchar', length: 128 })
  payloadHash: string;

  // The hash of the PREVIOUS event in the chain for this document.
  // This creates a blockchain-like immutable ledger per document.
  @Column({ name: 'previous_hash', type: 'varchar', length: 128, nullable: true })
  previousHash: string | null;

  // The overall hash combining the payloadHash + previousHash + timestamp
  @Column({ name: 'chain_hash', type: 'varchar', length: 128 })
  chainHash: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'timestamp', type: 'timestamptz' })
  timestamp: Date;
}
