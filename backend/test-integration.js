"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const incident_service_1 = require("./src/modules/incident/incidents/incident.service");
const incident_workflow_service_1 = require("./src/modules/incident/incidents/incident-workflow.service");
const tenant_context_storage_1 = require("./src/modules/platform/tenant/context/tenant-context-storage");
const user_entity_1 = require("./src/modules/users/entities/user.entity");
async function run() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const incidentService = app.get(incident_service_1.IncidentService);
    const workflowService = app.get(incident_workflow_service_1.IncidentWorkflowService);
    console.log('--- Starting Integration Pass ---');
    const actor = new user_entity_1.User();
    actor.id = '00000000-0000-0000-0000-000000000001';
    actor.username = 'integration.test';
    const categoryRepo = app.get('IncidentCategoryRepository');
    const cat = await categoryRepo.findOne({ where: { code: 'PATIENT_SAFETY' } });
    await tenant_context_storage_1.TenantContextStorage.runAsSystem(async () => {
        try {
            console.log('1. Creating Incident (DRAFT)...');
            const draft = await incidentService.create({
                categoryId: cat.id,
                severityCode: 'LOW',
                priorityCode: 'ROUTINE',
                department: 'Emergency',
                incidentDate: new Date().toISOString(),
                description: 'Test integration incident',
                isNearMiss: false,
            }, actor);
            console.log(`Created Incident: ${draft.incidentNumber} [${draft.id}] - Status: ${draft.status}`);
            console.log('2. Transitioning to SUBMITTED...');
            const submitted = await incidentService.transition(draft.id, 'SUBMITTED', actor);
            console.log(`Status now: ${submitted.status}`);
            console.log('3. Transitioning to ACKNOWLEDGED...');
            const ack = await incidentService.transition(draft.id, 'ACKNOWLEDGED', actor);
            console.log(`Status now: ${ack.status}`);
            console.log('--- Integration Pass Successful ---');
        }
        catch (err) {
            console.error('Integration Pass Failed:', err);
            process.exit(1);
        }
    });
    await app.close();
}
run();
//# sourceMappingURL=test-integration.js.map