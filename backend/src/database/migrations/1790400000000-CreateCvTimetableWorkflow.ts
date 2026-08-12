import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Children's Village Timetable Management -- Phase 6 (Workflow
 * Integration).
 *
 * IMPORTANT ARCHITECTURAL NOTE (see chat for full discussion): the design
 * spec originally called for reusing the existing
 * `document-platform/workflow-engine` module's tables directly
 * (`hdsp_document_workflow_templates`/`_instances`/`_tasks`). Two things
 * were discovered during Phase 6 research that made that unsafe:
 *
 *  1. `WorkflowInstanceEntity.documentInstanceId` is UNIQUE and every
 *     driving service (`WorkflowEngineService.executeAction`,
 *     `TaskEngineService.handleStateChanged`) is hardwired to
 *     `DocumentInstanceService`/`DocumentVersionEntity` -- there is no
 *     generic "start a workflow for anything" entry point.
 *  2. NEITHER `hdsp_document_workflow_templates` NOR
 *     `hdsp_document_workflow_tasks` has a `tenant_id` column -- a full
 *     search of `document-platform/` for tenant references returned zero
 *     matches. That module predates (or was simply never brought into)
 *     this codebase's Stage B tenant-isolation work.
 *
 * Writing Children's Village data into either table would mean CV
 * approval data has no DB-level tenant isolation, which conflicts with
 * this module's own hard "preserve multi-tenant isolation" requirement.
 * Modifying document-platform's entities/services to fix this was
 * explicitly ruled out (out of scope, risks a different module's existing
 * approval flows).
 *
 * Resolution (confirmed): build CV's own tenant-scoped tables below, but
 * genuinely reuse document-platform's DESIGN -- the `definition` column
 * on `cv_timetable_workflow_templates` is typed against the *exact same*
 * `WorkflowDefinition`/`WorkflowState`/`WorkflowTransition`/
 * `WorkflowAssignment` TypeScript interfaces imported (type-only, zero
 * runtime coupling) from
 * `document-platform/workflow-engine/models/workflow-definition.ts`. Same
 * approval-chain authoring model (states, transitions, hierarchical
 * role/department/team/user assignment), properly tenant-isolated tables.
 */
export class CreateCvTimetableWorkflow1790400000000 implements MigrationInterface {
  name = 'CreateCvTimetableWorkflow1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cv_timetable_workflow_templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "name" varchar(150) NOT NULL,
        "change_type" varchar(30) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'draft',
        "version_no" integer NOT NULL DEFAULT 1,
        "definition" jsonb NOT NULL,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_timetable_workflow_templates" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_WF_TEMPLATES_TENANT_CHANGE_TYPE"
        ON "cv_timetable_workflow_templates" ("tenant_id", "change_type", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "cv_timetable_workflow_instances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "workflow_template_id" uuid NOT NULL,
        "source_type" varchar(30) NOT NULL,
        "source_id" uuid NOT NULL,
        "class_id" uuid,
        "current_state" varchar(100) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "outcome" varchar(20),
        "initiated_by" uuid NOT NULL,
        "started_at" TIMESTAMP NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_timetable_workflow_instances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_tt_wf_instances_template" FOREIGN KEY ("workflow_template_id")
          REFERENCES "cv_timetable_workflow_templates"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_WF_INSTANCES_SOURCE" ON "cv_timetable_workflow_instances" ("source_type", "source_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_WF_INSTANCES_TENANT_STATUS" ON "cv_timetable_workflow_instances" ("tenant_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "cv_timetable_workflow_tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "hospital_id" uuid,
        "instance_id" uuid NOT NULL,
        "workflow_state" varchar(100) NOT NULL,
        "approver_type" varchar(30) NOT NULL,
        "approver_value" varchar(255),
        "assigned_user_id" uuid,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "outcome" varchar(20),
        "comment" text,
        "due_date" TIMESTAMP,
        "sla_minutes" integer,
        "escalation_level" integer NOT NULL DEFAULT 0,
        "completed_by_user_id" uuid,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_timetable_workflow_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_tt_wf_tasks_instance" FOREIGN KEY ("instance_id")
          REFERENCES "cv_timetable_workflow_instances"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_WF_TASKS_INSTANCE" ON "cv_timetable_workflow_tasks" ("instance_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_WF_TASKS_ASSIGNEE" ON "cv_timetable_workflow_tasks" ("assigned_user_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_CV_TT_WF_TASKS_TENANT_STATUS" ON "cv_timetable_workflow_tasks" ("tenant_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_timetable_workflow_tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_timetable_workflow_instances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_timetable_workflow_templates"`);
  }
}
