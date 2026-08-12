import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('platform_ai_usage')
export class AiUsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ nullable: true })
  hospitalId?: string;

  @Column({ nullable: true })
  departmentId?: string;

  @Column({ nullable: true })
  userId?: string;

  @Column()
  capability: string;

  @Column()
  providerId: string;

  @Column({ type: 'int' })
  inputTokens: number;

  @Column({ type: 'int' })
  outputTokens: number;

  @Column({ type: 'decimal', precision: 10, scale: 6 })
  cost: number;

  @Column({ type: 'date' })
  billingDate: string; // YYYY-MM-DD

  @CreateDateColumn()
  timestamp: Date;
}
