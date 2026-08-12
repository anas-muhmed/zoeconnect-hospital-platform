import { Module } from '@nestjs/common';
import { DocumentEngineModule } from '../document-engine/document-engine.module';
import { FormsRuntimeService } from './forms-runtime.service';
import { FormsRuntimeController } from './forms-runtime.controller';
import { PluginRegistryService } from './plugin-registry.service';
import { ExecutionContextBuilder } from './execution-context/execution-context.builder';
import { LifecycleOrchestratorService } from './execution-platform/lifecycle-orchestrator.service';
import { PluginHookService } from './execution-platform/plugin-hook.service';
import { ComputedFieldsEngine } from './execution-platform/computed-fields.engine';
import { ExecutionMetricsInterceptor } from './execution-platform/execution-metrics.interceptor';

/**
 * FormsRuntimeModule (Milestone 4, ADR-003/ADR-015) — the Runtime half of
 * Builder/Renderer separation. Exposes the Runtime API namespace
 * (`/forms/runtime/...`) backed by FormsRuntimeService, which delegates
 * all persistence to DocumentService + DocumentInstanceService and all PDF
 * generation to PdfEngineService (both from DocumentEngineModule).
 *
 * ADR-015: FormsRuntimeModule never reimplements Document Platform logic.
 * All it adds is the schema-aware validation layer (validateAnswersAgainstSchema,
 * shared with the client-side Renderer per ADR-012) and the route handlers.
 *
 * Non-goals (later milestones):
 * - Override resolution (Milestone 5, ADR-011)
 * - Real workflow transitions (Milestone 5, ADR-008)
 * - Signature capture (Milestone 7, Wave 5)
 * - Notification emission (Milestone 5)
 */
@Module({
  imports: [DocumentEngineModule],
  controllers: [FormsRuntimeController],
  providers: [
    FormsRuntimeService, 
    PluginRegistryService, 
    ExecutionContextBuilder,
    LifecycleOrchestratorService,
    PluginHookService,
    ComputedFieldsEngine,
    ExecutionMetricsInterceptor,
  ],
  exports: [FormsRuntimeService, ExecutionContextBuilder],
})
export class FormsRuntimeModule { }
