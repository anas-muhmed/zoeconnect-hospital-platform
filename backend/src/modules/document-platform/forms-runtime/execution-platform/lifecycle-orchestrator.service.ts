import { Injectable, BadRequestException } from '@nestjs/common';
import { validateAnswersAgainstSchema, BASIC_COMPONENT_DEFINITIONS } from '@hdsp/form-schema';
import { DocumentInstanceService } from '../../document-engine/services/document-instance.service';
import { DocumentService } from '../../document-engine/services/document.service';
import { DocumentSnapshotService } from '../../document-engine/services/document-snapshot.service';
import { ExecutionContextBuilder } from '../execution-context/execution-context.builder';
import { PluginHookService } from './plugin-hook.service';
import { ComputedFieldsEngine } from './computed-fields.engine';
import { PluginRegistryService } from '../plugin-registry.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { 
  DocumentAutosavedEvent, 
  DocumentFinalizedEvent, 
  SnapshotGeneratedEvent 
} from '../../document-events/document.events';

/**
 * LifecycleOrchestratorService
 * Phase 2.5: Runtime Execution Platform
 * 
 * Orchestrates the full lifecycle of a document interaction:
 * hydration -> hooks -> computed fields -> validation -> persistence -> snapshots.
 * This separates orchestration from the basic schema lookups in FormsRuntimeService.
 */
@Injectable()
export class LifecycleOrchestratorService {
  constructor(
    private readonly instanceService: DocumentInstanceService,
    private readonly documentService: DocumentService,
    private readonly snapshotService: DocumentSnapshotService,
    private readonly executionContextBuilder: ExecutionContextBuilder,
    private readonly pluginHookService: PluginHookService,
    private readonly computedFieldsEngine: ComputedFieldsEngine,
    private readonly pluginRegistryService: PluginRegistryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async orchestrateSave(instanceId: string, answers: Record<string, unknown>, expectedVersion: number) {
    const instance = await this.instanceService.getInstance(instanceId);
    if (!instance || !instance.documentVersionId) {
      throw new BadRequestException('Instance not found');
    }

    const version = await this.documentService.getVersionById(instance.documentVersionId);
    const schema = version.payload as any;

    const executionContext = await this.executionContextBuilder.buildContext(instance);
    
    const hookContext = {
      schema,
      answers: { ...instance.answers, ...answers },
      executionContext: executionContext.variables,
    };

    // 1. Hook: Before Save
    let finalAnswers = await this.pluginHookService.onBeforeSave(hookContext);

    // 2. Compute Fields
    finalAnswers = this.computedFieldsEngine.evaluate(schema, finalAnswers, executionContext.variables);

    // 3. Persist
    // We only pass the delta or the merged final result? The instanceService.saveAnswers merges.
    // Wait, since we merged in hookContext, we should pass the full finalAnswers and tell instanceService.saveAnswers.
    // However, instanceService.saveAnswers does a shallow merge. So passing finalAnswers is fine.
    const savedInstance = await this.instanceService.saveAnswers(instanceId, finalAnswers, expectedVersion);

    // 4. Hook: After Save
    await this.pluginHookService.onAfterSave({ ...hookContext, answers: savedInstance.answers });

    // 5. Emit Domain Event
    this.eventEmitter.emit(
      'document.autosaved',
      new DocumentAutosavedEvent(instanceId, 'system', savedInstance.version)
    );

    return savedInstance;
  }

  async orchestrateFinalize(instanceId: string, submittedBy: string, expectedVersion: number) {
    const instance = await this.instanceService.getInstance(instanceId);
    if (!instance) {
      throw new BadRequestException('Instance not found');
    }

    const version = await this.documentService.getVersionById(instance.documentVersionId!);
    const schema = version.payload as any;

    const executionContext = await this.executionContextBuilder.buildContext(instance);
    
    let hookContext = {
      schema,
      answers: instance.answers as Record<string, unknown>,
      executionContext: executionContext.variables,
    };

    // 1. Hook: Before Finalize
    const finalAnswers = await this.pluginHookService.onBeforeFinalize(hookContext);
    
    // 2. Fetch dynamic components for validation
    const definitions = this.pluginRegistryService.getComponentDefinitions();

    // 3. Validate
    const validationResult = validateAnswersAgainstSchema(
      schema, 
      finalAnswers, 
      definitions,
      { variables: executionContext.variables }
    );
    if (!validationResult.valid) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validationResult.errors,
      });
    }

    // 4. Finalize
    const finalizedInstance = await this.instanceService.finalizeInstance(instanceId, submittedBy, expectedVersion);
    
    // 5. Create Snapshot
    const snapshot = await this.snapshotService.createSnapshot(
      instanceId,
      schema,
      executionContext.variables,
      finalAnswers,
      {
        templateVersionId: version.id,
        templateVersionString: String(version.versionNo),
        documentRevision: finalizedInstance.version,
        createdBy: submittedBy,
        executionContextVersion: '1.0.0', // Future: from context builder
        ruleEngineVersion: '1.0.0',       // Future: from rule engine
        pluginVersions: {},               // Future: from plugin registry
        snapshotReason: 'finalization',
      }
    );

    // 6. Hook: After Finalize
    await this.pluginHookService.onAfterFinalize({ ...hookContext, answers: finalAnswers });

    // 7. Emit Domain Events
    this.eventEmitter.emit(
      'document.finalized',
      new DocumentFinalizedEvent(instanceId, submittedBy)
    );
    this.eventEmitter.emit(
      'document.snapshot_generated',
      new SnapshotGeneratedEvent(instanceId, snapshot.id)
    );

    return finalizedInstance;
  }
}
