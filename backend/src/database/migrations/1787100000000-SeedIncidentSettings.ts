import { MigrationInterface, QueryRunner } from "typeorm";
import { v4 as uuidv4 } from 'uuid';

export class SeedIncidentSettings1787100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tenantRes = await queryRunner.query(`SELECT id FROM "tenants" LIMIT 1`);
    const tenantId = tenantRes[0]?.id;

    if (!tenantId) {
      console.log('No default tenant found. Skipping Incident settings seed.');
      return;
    }

    // 1. Categories
    const categories = [
      { id: uuidv4(), code: 'CAT-CLINICAL', name: 'Clinical', description: 'Patient care related incidents' },
      { id: uuidv4(), code: 'CAT-MED', name: 'Medication', description: 'Medication administration or prescription errors' },
      { id: uuidv4(), code: 'CAT-FAC', name: 'Facility/Safety', description: 'Building, equipment, or environmental hazards' },
      { id: uuidv4(), code: 'CAT-SEC', name: 'Security', description: 'Theft, assault, unauthorized access' }
    ];

    for (const cat of categories) {
      await queryRunner.query(`
        INSERT INTO "incident_categories" ("id", "tenant_id", "code", "name", "description", "is_active")
        VALUES ($1, $2, $3, $4, $5, true)
      `, [cat.id, tenantId, cat.code, cat.name, cat.description]);
    }

    // 2. Types
    const types = [
      { id: uuidv4(), catId: categories[0].id, code: 'TYP-FALL', name: 'Patient Fall' },
      { id: uuidv4(), catId: categories[0].id, code: 'TYP-ID', name: 'Patient Identification Error' },
      { id: uuidv4(), catId: categories[1].id, code: 'TYP-DOSE', name: 'Wrong Dose' },
      { id: uuidv4(), catId: categories[1].id, code: 'TYP-DRUG', name: 'Wrong Drug' },
      { id: uuidv4(), catId: categories[2].id, code: 'TYP-SLIP', name: 'Slip and Trip' },
      { id: uuidv4(), catId: categories[3].id, code: 'TYP-THEFT', name: 'Property Theft' },
    ];

    for (const type of types) {
      await queryRunner.query(`
        INSERT INTO "incident_types" ("id", "tenant_id", "category_id", "code", "name", "is_active")
        VALUES ($1, $2, $3, $4, $5, true)
      `, [type.id, tenantId, type.catId, type.code, type.name]);
    }

    // 3. Severities
    const severities = [
      { id: uuidv4(), code: 'SEV-1', name: 'Low', description: 'Minor or no harm', color: '#4caf50', slaHours: 72 },
      { id: uuidv4(), code: 'SEV-2', name: 'Medium', description: 'Moderate harm', color: '#ff9800', slaHours: 48 },
      { id: uuidv4(), code: 'SEV-3', name: 'High', description: 'Severe harm', color: '#f44336', slaHours: 24 },
      { id: uuidv4(), code: 'SEV-4', name: 'Sentinel', description: 'Death or catastrophic harm', color: '#b71c1c', slaHours: 4 },
    ];

    for (const sev of severities) {
      await queryRunner.query(`
        INSERT INTO "incident_severity_levels" ("id", "tenant_id", "code", "name", "description", "color_code", "sla_hours_resolution", "is_active")
        VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      `, [sev.id, tenantId, sev.code, sev.name, sev.description, sev.color, sev.slaHours]);
    }

    // 4. Priorities (Enum mapping config)
    const priorities = [
      { id: uuidv4(), code: 'PRI-1', name: 'Low', rank: 1, slaHours: 72 },
      { id: uuidv4(), code: 'PRI-2', name: 'Medium', rank: 2, slaHours: 48 },
      { id: uuidv4(), code: 'PRI-3', name: 'High', rank: 3, slaHours: 24 },
      { id: uuidv4(), code: 'PRI-4', name: 'Urgent', rank: 4, slaHours: 4 },
    ];

    for (const pri of priorities) {
      await queryRunner.query(`
        INSERT INTO "incident_priority_levels" ("id", "tenant_id", "code", "name", "rank_order", "sla_hours_response", "is_active")
        VALUES ($1, $2, $3, $4, $5, $6, true)
      `, [pri.id, tenantId, pri.code, pri.name, pri.rank, pri.slaHours]);
    }

    // 5. Risk Matrix (Probability x Severity = Risk Score)
    // E.g. Rare (1) * Low (1) = 1 (Low)
    const riskMatrix = [
      { probability: 1, severity: 1, score: 1, level: 'Low' },
      { probability: 2, severity: 2, score: 4, level: 'Medium' },
      { probability: 3, severity: 3, score: 9, level: 'High' },
      { probability: 4, severity: 4, score: 16, level: 'Critical' },
    ];

    for (const risk of riskMatrix) {
      await queryRunner.query(`
        INSERT INTO "incident_risk_matrix_config" ("id", "tenant_id", "probability_score", "severity_score", "resulting_risk_score", "resulting_risk_level")
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [uuidv4(), tenantId, risk.probability, risk.severity, risk.score, risk.level]);
    }

    // 6. Default Notification Rules
    const notifs = [
      { id: uuidv4(), event: 'INCIDENT_CREATED', recipient: 'MANAGER', template: 'incident_created_manager' },
      { id: uuidv4(), event: 'INCIDENT_ESCALATED', recipient: 'RISK_TEAM', template: 'incident_escalated_risk' },
    ];

    for (const n of notifs) {
      await queryRunner.query(`
        INSERT INTO "incident_notification_rules" ("id", "tenant_id", "event_type", "recipient_role", "email_template_code", "is_active")
        VALUES ($1, $2, $3, $4, $5, true)
      `, [n.id, tenantId, n.event, n.recipient, n.template]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "incident_notification_rules"`);
    await queryRunner.query(`DELETE FROM "incident_risk_matrix_config"`);
    await queryRunner.query(`DELETE FROM "incident_priority_levels"`);
    await queryRunner.query(`DELETE FROM "incident_severity_levels"`);
    await queryRunner.query(`DELETE FROM "incident_types"`);
    await queryRunner.query(`DELETE FROM "incident_categories"`);
  }
}
