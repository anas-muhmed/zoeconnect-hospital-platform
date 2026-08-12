import { Module } from '@nestjs/common';
import { DocumentEngineModule } from './document-engine/document-engine.module';
import { WorkflowEngineModule } from './workflow-engine/workflow-engine.module';
import { ComplianceEngineModule } from './compliance-engine/compliance-engine.module';
import { AssetLibraryModule } from './asset-library/asset-library.module';

const enableFormsModule = process.env.ENABLE_FORMS_MODULE === 'true';

const importsAndExports = [
  DocumentEngineModule,
  WorkflowEngineModule,
  ComplianceEngineModule,
  AssetLibraryModule,
];

if (enableFormsModule) {
  // @ts-ignore - gracefully ignore these during compilation when forms module is disabled
  const { FormsDesignerModule } = require('./forms-designer/forms-designer.module');
  // @ts-ignore
  const { FormsRuntimeModule } = require('./forms-runtime/forms-runtime.module');
  // @ts-ignore
  const { FormsImportModule } = require('./forms-import/forms-import.module');

  importsAndExports.push(FormsDesignerModule, FormsRuntimeModule, FormsImportModule);
}

/**
 * DocumentPlatformModule — the aggregate root for all Document Platform services
 * (ADR-002).
 */
@Module({
  imports: importsAndExports,
  exports: importsAndExports,
})
export class DocumentPlatformModule {}
