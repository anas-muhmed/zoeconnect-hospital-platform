/**
 * Standalone, real-database measurement of the N+1 fix in
 * EicProgressReportService.findByEnrollment() / hydrateLiveDrafts() /
 * hydrateLiveSections() (and its EicDisciplineAssignmentService.findActivePrimaryBatch()
 * companion).
 *
 * Runs against the live dev Postgres (backend/.env). Does NOT touch business
 * logic — this only seeds a tagged, disposable report + reads it + counts
 * the SQL statements TypeORM actually issues.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/measure-eic-n1.ts seed
 *   npx ts-node -r tsconfig-paths/register scripts/measure-eic-n1.ts measure [label]
 *   npx ts-node -r tsconfig-paths/register scripts/measure-eic-n1.ts cleanup
 *
 * Typical before/after run (from repo root):
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/measure-eic-n1.ts seed
 *   npx ts-node -r tsconfig-paths/register scripts/measure-eic-n1.ts measure NEW   # fix currently applied
 *   git stash                                                                     # revert to old per-section code
 *   npx ts-node -r tsconfig-paths/register scripts/measure-eic-n1.ts measure OLD
 *   git stash pop                                                                 # restore the fix
 *   npx ts-node -r tsconfig-paths/register scripts/measure-eic-n1.ts cleanup
 *
 * Seed data is tagged with a distinctive marker (patient MRN / enrollment
 * number / user username+email all start with the same "N1TEST-<ts>-"
 * prefix) and the ids needed to re-find + delete it are written to a JSON
 * file in the OS temp dir, so `measure` can be invoked multiple times
 * against the *same* seeded report (required for an apples-to-apples
 * before/after comparison) and `cleanup` can find everything again even
 * from a fresh process.
 */

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { DataSource, In } from 'typeorm';
import type { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { EicProgressReport } from '../src/modules/eic/entities/eic-progress-report.entity';
import { EicDisciplineProgressSection } from '../src/modules/eic/entities/eic-discipline-progress-section.entity';
import { EicAssessment } from '../src/modules/eic/entities/eic-assessment.entity';
import { EicGoal } from '../src/modules/eic/entities/eic-goal.entity';
import { EicTherapySession } from '../src/modules/eic/entities/eic-therapy-session.entity';
import {
  EicEnrollmentDisciplineAssignment,
  AssignmentRole,
} from '../src/modules/eic/entities/eic-enrollment-discipline-assignment.entity';
import { EicTherapyEnrollment } from '../src/modules/eic/entities/eic-therapy-enrollment.entity';
import { EicPatient } from '../src/modules/eic/entities/eic-patient.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { EicDiscipline } from '../src/modules/eic/common/enums/discipline.enum';
import { EicReportStatus, EicSectionStatus, EicGoalStatus } from '../src/modules/eic/common/enums/assessment-status.enum';

import { EicProgressReportService } from '../src/modules/eic/progress-report/eic-progress-report.service';
import { EicProgressReportPolicy } from '../src/modules/eic/progress-report/eic-progress-report.policy';
import { EicDisciplineAssignmentService } from '../src/modules/eic/discipline-assignment/eic-discipline-assignment.service';
import { TenantScopedRepository } from '../src/modules/platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../src/modules/platform/tenant/context/tenant-context-storage';
import { AuditService } from '../src/modules/audit/audit.service';

const SEED_FILE = path.join(os.tmpdir(), 'zoeconnect-eic-n1-measure-seed.json');

const ALL_DISCIPLINES: EicDiscipline[] = [
  EicDiscipline.BT,
  EicDiscipline.SLP,
  EicDiscipline.DT,
  EicDiscipline.OT,
  EicDiscipline.SE,
  EicDiscipline.PRESCHOOL,
];
// These two disciplines deliberately get NO assessment of their own, so
// hydrateLiveSections() has to fall through to the assignment+user lookup
// path (query categories 4 and 5) for them, same as it would for a real
// unassessed-but-assigned discipline.
const NO_ASSESSMENT_DISCIPLINES = new Set<EicDiscipline>([EicDiscipline.SE, EicDiscipline.PRESCHOOL]);

interface SeedInfo {
  marker: string;
  tenantId: string;
  patientId: string;
  enrollmentId: string;
  reportId: string;
  therapistUserId: string;
}

class QueryCounterLogger implements TypeOrmLogger {
  count = 0;
  queries: string[] = [];
  logQuery(query: string, _parameters?: unknown[], _queryRunner?: QueryRunner) {
    this.count++;
    this.queries.push(query);
  }
  logQueryError() {}
  logQuerySlow() {}
  logSchemaBuild() {}
  logMigration() {}
  log() {}
}

function buildDataSource(logger: TypeOrmLogger): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '55432', 10),
    database: process.env.DB_NAME || 'hdsp_db',
    username: process.env.DB_USER || 'hdsp_app',
    password: process.env.DB_PASSWORD || '',
    synchronize: false,
    logging: 'all',
    logger,
    entities: [path.join(__dirname, '../src/**/*.entity{.ts,.js}')],
  });
}

async function seed() {
  const logger = new QueryCounterLogger();
  const ds = buildDataSource(logger);
  await ds.initialize();

  try {
    const marker = `N1TEST-${Date.now()}`;
    const tenantId = randomUUID();

    const patientRepo = ds.getRepository(EicPatient);
    const enrollmentRepo = ds.getRepository(EicTherapyEnrollment);
    const reportRepo = ds.getRepository(EicProgressReport);
    const sectionRepo = ds.getRepository(EicDisciplineProgressSection);
    const assessmentRepo = ds.getRepository(EicAssessment);
    const goalRepo = ds.getRepository(EicGoal);
    const sessionRepo = ds.getRepository(EicTherapySession);
    const assignmentRepo = ds.getRepository(EicEnrollmentDisciplineAssignment);
    const userRepo = ds.getRepository(User);

    const patient = await patientRepo.save(patientRepo.create({
      mrn: marker,
      firstName: 'N1Test',
      lastName: 'Patient',
      fullName: 'N1Test Patient (measure-eic-n1 seed)',
    }));

    const enrollment = await enrollmentRepo.save(enrollmentRepo.create({
      patientId: patient.id,
      enrollmentNumber: marker,
      admissionDate: '2026-01-01',
      activeDisciplines: ALL_DISCIPLINES,
      tenantId,
    }));

    const report = await reportRepo.save(reportRepo.create({
      enrollmentId: enrollment.id,
      reportNumber: 1,
      periodFrom: '2026-05-01',
      periodTo: '2026-08-01',
      status: EicReportStatus.IN_PROGRESS,
      tenantId,
    }));

    for (const discipline of ALL_DISCIPLINES) {
      await sectionRepo.save(sectionRepo.create({
        progressReportId: report.id,
        discipline,
        status: EicSectionStatus.PENDING,
        tenantId,
        sectionData: {},
      }));
    }

    // One real therapist user — resolved via the assignment+user fallback
    // path for the two unassessed disciplines.
    const therapistUser = await userRepo.save(userRepo.create({
      username: `${marker}-therapist`,
      email: `${marker}-therapist@example.invalid`,
      passwordHash: 'not-a-real-hash',
      fullName: 'N1Test Fallback Therapist',
      tenantId,
    }));

    // Assessments for 4 of 6 disciplines (BT/SLP/DT/OT). therapistName is
    // NOT NULL on this entity, so any assessed discipline resolves its
    // section's therapist name straight from the assessment snapshot.
    const assessmentByDiscipline = new Map<EicDiscipline, EicAssessment>();
    for (const discipline of ALL_DISCIPLINES) {
      if (NO_ASSESSMENT_DISCIPLINES.has(discipline)) continue;
      const assessment = await assessmentRepo.save(assessmentRepo.create({
        enrollmentId: enrollment.id,
        discipline,
        therapistId: `${marker}-static-therapist-id`,
        therapistName: `${discipline} Static Therapist`,
        clinicalObservations: { note: 'seed clinical observation' },
        recommendations: 'seed recommendation',
        tenantId,
      }));
      assessmentByDiscipline.set(discipline, assessment);
    }
    // FK anchor for goals under the two unassessed disciplines — eic_goals.assessment_id
    // is NOT NULL + FK'd to eic_assessments, but a goal's own `discipline` column is
    // independent of the assessment it's anchored to (same decoupling the real
    // per-discipline query filters rely on), so this is a legitimate anchor, not a fudge.
    const anchorAssessment = assessmentByDiscipline.get(EicDiscipline.BT)!;

    // 3 goals per discipline, mixed statuses, across all 6 disciplines.
    const goalStatuses = [EicGoalStatus.ACTIVE, EicGoalStatus.ACHIEVED, EicGoalStatus.DISCONTINUED];
    for (const discipline of ALL_DISCIPLINES) {
      const assessmentForFk = assessmentByDiscipline.get(discipline) ?? anchorAssessment;
      for (let i = 0; i < 3; i++) {
        await goalRepo.save(goalRepo.create({
          assessmentId: assessmentForFk.id,
          enrollmentId: enrollment.id,
          discipline,
          goalText: `${discipline} seed goal #${i + 1}`,
          status: goalStatuses[i % goalStatuses.length],
          tenantId,
        }));
      }
    }

    // 3 sessions per discipline, mixed attendance, within the report period.
    const attendances = ['PRESENT', 'PRESENT', 'ABSENT'];
    for (const discipline of ALL_DISCIPLINES) {
      for (let i = 0; i < 3; i++) {
        await sessionRepo.save(sessionRepo.create({
          enrollmentId: enrollment.id,
          discipline,
          sessionDate: `2026-0${6 + (i % 2)}-1${i + 1}`,
          therapistId: `${marker}-static-therapist-id`,
          therapistName: `${discipline} Static Therapist`,
          attendance: attendances[i % attendances.length],
          tenantId,
        }));
      }
    }

    // Active PRIMARY assignments for the two unassessed disciplines only —
    // this is exactly the fallback case hydrateLiveSections()'s "needsAssignment"
    // branch exists for.
    for (const discipline of NO_ASSESSMENT_DISCIPLINES) {
      await assignmentRepo.save(assignmentRepo.create({
        enrollmentId: enrollment.id,
        discipline,
        therapistId: therapistUser.id,
        role: AssignmentRole.PRIMARY,
        effectiveFrom: '2026-01-01',
        isActive: true,
        assignedBy: therapistUser.id,
        version: 1,
        tenantId,
      }));
    }

    const info: SeedInfo = {
      marker,
      tenantId,
      patientId: patient.id,
      enrollmentId: enrollment.id,
      reportId: report.id,
      therapistUserId: therapistUser.id,
    };
    fs.writeFileSync(SEED_FILE, JSON.stringify(info, null, 2));

    console.log('Seeded EIC N+1 measurement fixture:');
    console.log(`  marker:        ${marker}`);
    console.log(`  tenantId:      ${tenantId}`);
    console.log(`  patientId:     ${patient.id}`);
    console.log(`  enrollmentId:  ${enrollment.id}`);
    console.log(`  reportId:      ${report.id}`);
    console.log(`  sections:      ${ALL_DISCIPLINES.length} (${ALL_DISCIPLINES.join(', ')})`);
    console.log(`  assessed:      ${[...assessmentByDiscipline.keys()].join(', ')}`);
    console.log(`  unassessed:    ${[...NO_ASSESSMENT_DISCIPLINES].join(', ')} (assignment+user fallback path)`);
    console.log(`  seed info written to: ${SEED_FILE}`);
  } finally {
    await ds.destroy();
  }
}

async function measure(label: string) {
  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`No seed file at ${SEED_FILE} — run "seed" first.`);
  }
  const info: SeedInfo = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  const logger = new QueryCounterLogger();
  const ds = buildDataSource(logger);
  await ds.initialize();

  try {
    const reportRepo = ds.getRepository(EicProgressReport);
    const sectionRepo = ds.getRepository(EicDisciplineProgressSection);
    const assessmentRepo = ds.getRepository(EicAssessment);
    const goalRepo = ds.getRepository(EicGoal);
    const sessionRepo = ds.getRepository(EicTherapySession);
    const userRepo = ds.getRepository(User);
    const assignmentRepo = ds.getRepository(EicEnrollmentDisciplineAssignment);

    const tenantContext = new TenantContextStorage();
    const scopedReportRepo = new TenantScopedRepository<EicProgressReport>(reportRepo, tenantContext);
    const scopedAssignmentRepo = new TenantScopedRepository<EicEnrollmentDisciplineAssignment>(assignmentRepo, tenantContext);

    const assignmentSvc = new EicDisciplineAssignmentService(
      assignmentRepo,
      scopedAssignmentRepo,
      tenantContext,
    );

    // findByEnrollment() doesn't call auditService.log() (only initiate()/sign() do),
    // so a minimal stub is honest here rather than standing up a real Bull/Redis queue.
    const auditServiceStub = { log: async () => {} } as unknown as AuditService;
    const policy = new EicProgressReportPolicy();
    const events = new EventEmitter2();

    const service = new EicProgressReportService(
      reportRepo,
      sectionRepo,
      assessmentRepo,
      goalRepo,
      sessionRepo,
      userRepo,
      assignmentSvc,
      policy,
      events,
      auditServiceStub,
      scopedReportRepo,
      tenantContext,
    );

    // Reset counters right before the call under measurement (constructor/setup queries excluded).
    logger.count = 0;
    logger.queries = [];

    const result = await TenantContextStorage.run(info.tenantId, async () => {
      const start = Date.now();
      const reports = await service.findByEnrollment(info.enrollmentId);
      const elapsedMs = Date.now() - start;
      return { reports, elapsedMs };
    });

    const sectionCount = result.reports[0]?.sections?.length ?? 0;

    console.log(`=== measure-eic-n1 [${label}] ===`);
    console.log(`  reports returned:   ${result.reports.length}`);
    console.log(`  sections on report: ${sectionCount}`);
    console.log(`  SQL queries:        ${logger.count}`);
    console.log(`  elapsed:            ${result.elapsedMs} ms`);
    console.log('  --- queries ---');
    logger.queries.forEach((q, i) => console.log(`  [${i + 1}] ${q.replace(/\s+/g, ' ').trim()}`));
  } finally {
    await ds.destroy();
  }
}

async function cleanup() {
  if (!fs.existsSync(SEED_FILE)) {
    console.log(`No seed file at ${SEED_FILE} — nothing to clean up.`);
    return;
  }
  const info: SeedInfo = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  const logger = new QueryCounterLogger();
  const ds = buildDataSource(logger);
  await ds.initialize();

  try {
    // Delete children-first, all scoped to the tagged enrollment/tenant so this
    // can never touch real data even if ids collide with something unrelated.
    await ds.query('DELETE FROM eic_goals WHERE enrollment_id = $1', [info.enrollmentId]);
    await ds.query('DELETE FROM eic_therapy_sessions WHERE enrollment_id = $1', [info.enrollmentId]);
    await ds.query('DELETE FROM eic_assessments WHERE enrollment_id = $1', [info.enrollmentId]);
    await ds.query('DELETE FROM eic_enrollment_discipline_assignments WHERE enrollment_id = $1', [info.enrollmentId]);
    await ds.query('DELETE FROM eic_discipline_progress_sections WHERE progress_report_id = $1', [info.reportId]);
    await ds.query('DELETE FROM eic_progress_reports WHERE id = $1', [info.reportId]);
    await ds.query('DELETE FROM eic_therapy_enrollments WHERE id = $1', [info.enrollmentId]);
    await ds.query('DELETE FROM eic_patients WHERE id = $1', [info.patientId]);
    await ds.query('DELETE FROM users WHERE id = $1', [info.therapistUserId]);

    fs.unlinkSync(SEED_FILE);
    console.log(`Cleaned up seed fixture (marker=${info.marker}) and removed ${SEED_FILE}.`);
  } finally {
    await ds.destroy();
  }
}

async function main() {
  const [, , cmd, arg] = process.argv;
  switch (cmd) {
    case 'seed':
      await seed();
      break;
    case 'measure':
      await measure(arg ?? 'measurement');
      break;
    case 'cleanup':
      await cleanup();
      break;
    default:
      console.error('Usage: ts-node scripts/measure-eic-n1.ts <seed|measure [label]|cleanup>');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
