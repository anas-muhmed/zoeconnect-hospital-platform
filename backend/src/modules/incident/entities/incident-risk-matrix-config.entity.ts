import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';

/**
 * IncidentRiskMatrixConfig — stores the administrator-configured 5×5 likelihood
 * × impact risk matrix. Each cell defines the resulting risk_level and color.
 *
 * risk_score is a generated column (likelihood * impact) in the database, so
 * it's NOT written by the application — it is read only.
 *
 * NABH and JCI accreditation require:
 *   - Initial risk score (before CAPA) → stored on the Incident as riskScore/riskLevel
 *   - Residual risk pre-CAPA → residualRiskScorePreCapa / residualRiskLevelPreCapa
 *   - Residual risk post-CAPA → residualRiskScorePostCapa / residualRiskLevelPostCapa
 */
@Entity('incident_risk_matrix_config')
@Unique(['tenantId', 'likelihood', 'impact'])
@Index(['tenantId'])
export class IncidentRiskMatrixConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'smallint' })
  likelihood: number;

  @Column({ type: 'smallint' })
  impact: number;

  /**
   * Generated always as likelihood * impact in PostgreSQL.
   * TypeORM maps it as select-only (no insert/update).
   */
  @Column({ name: 'risk_score', type: 'smallint', insert: false, update: false })
  riskScore: number;

  @Column({ name: 'risk_level', type: 'varchar', length: 20, default: 'MEDIUM' })
  riskLevel: string;

  @Column({ type: 'varchar', length: 20, default: '#F59E0B' })
  color: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
