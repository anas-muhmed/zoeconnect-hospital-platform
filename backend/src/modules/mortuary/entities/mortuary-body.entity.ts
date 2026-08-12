import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique,
} from 'typeorm';

/**
 * Mortuary integration (Phase 2, Stage A/B). Ports `bodies`, tenant-scoped.
 *
 * `bodyNumber` generation (hospital-clientId-prefixed, per-hospital
 * sequence — see `generateBodyNumber()` in the source `config/db.js`) is
 * business logic ported in Stage C, not represented here beyond the
 * column itself. `nocCertificateObjectKey` replaces the old
 * `nocCertificateUrl` TEXT column (Stage E, object-repository).
 *
 * `dateOfDeath`/`timeOfDeath` are kept as free-text VARCHAR exactly as in
 * the source schema (not converted to a `date`/`time` column type) —
 * the original schema stored these as strings with no format constraint,
 * and changing that is a real behavior change, not a pure architecture
 * port, so it's deliberately out of scope here.
 *
 * Stage B deviation (D2): `bodyNumber` moves from the source's flat
 * GLOBAL UNIQUE to UNIQUE ("tenantId", "bodyNumber") — see the Stage B
 * migration's doc comment for rationale.
 */
@Entity('mortuary_bodies')
@Unique(['tenantId', 'bodyNumber'])
export class MortuaryBody {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'body_number', type: 'varchar', length: 50 })
  bodyNumber: string;

  @Column({ name: 'body_type', type: 'varchar', length: 50 })
  bodyType: string;

  @Column({ name: 'hospital_number', type: 'varchar', length: 100, nullable: true })
  hospitalNumber: string | null;

  @Column({ name: 'patient_name', type: 'varchar', length: 255, nullable: true })
  patientName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'int', nullable: true })
  age: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  locality: string | null;

  @Column({ name: 'date_of_death', type: 'varchar', length: 50, nullable: true })
  dateOfDeath: string | null;

  @Column({ name: 'time_of_death', type: 'varchar', length: 50, nullable: true })
  timeOfDeath: string | null;

  @Column({ name: 'declared_by', type: 'varchar', length: 255, nullable: true })
  declaredBy: string | null;

  @Column({ name: 'reason_of_death', type: 'text', nullable: true })
  reasonOfDeath: string | null;

  @Column({ name: 'death_intimation_no', type: 'varchar', length: 100, nullable: true })
  deathIntimationNo: string | null;

  @Column({ name: 'mlc_no', type: 'varchar', length: 100, nullable: true })
  mlcNo: string | null;

  @Column({ name: 'estimated_days_of_stay', type: 'int', nullable: true })
  estimatedDaysOfStay: number | null;

  @Column({ name: 'witness1_name', type: 'varchar', length: 255, nullable: true })
  witness1Name: string | null;

  @Column({ name: 'witness1_address', type: 'text', nullable: true })
  witness1Address: string | null;

  @Column({ name: 'witness1_contact', type: 'varchar', length: 50, nullable: true })
  witness1Contact: string | null;

  @Column({ name: 'witness2_name', type: 'varchar', length: 255, nullable: true })
  witness2Name: string | null;

  @Column({ name: 'witness2_address', type: 'text', nullable: true })
  witness2Address: string | null;

  @Column({ name: 'witness2_contact', type: 'varchar', length: 50, nullable: true })
  witness2Contact: string | null;

  @Column({ name: 'billing_status', type: 'varchar', length: 50, default: 'PENDING', nullable: true })
  billingStatus: string | null;

  @Column({ type: 'varchar', length: 50, default: 'Registered', nullable: true })
  status: string | null;

  @Column({ name: 'police_station_name', type: 'varchar', length: 255, nullable: true })
  policeStationName: string | null;

  @Column({ name: 'station_si_name', type: 'varchar', length: 255, nullable: true })
  stationSiName: string | null;

  @Column({ name: 'present_police_officer_name', type: 'varchar', length: 255, nullable: true })
  presentPoliceOfficerName: string | null;

  /** Object-repository storage key (Stage E), replaces the old TEXT URL column. */
  @Column({ name: 'noc_certificate_object_key', type: 'text', nullable: true })
  nocCertificateObjectKey: string | null;

  @Column({ name: 'freezer_required', type: 'smallint', default: 1, nullable: true })
  freezerRequired: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
