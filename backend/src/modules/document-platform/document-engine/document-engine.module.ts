import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from './entities/document.entity';
import { DocumentVersionEntity } from './entities/document-version.entity';
import { DocumentOverrideEntity } from './entities/document-override.entity';
import { DocumentOverrideVersionEntity } from './entities/document-override-version.entity';
import { DocumentInstanceEntity } from './entities/document-instance.entity';
import { DocumentSnapshotEntity } from './entities/document-snapshot.entity';
import { DocumentSignatureEntity } from './entities/document-signature.entity';
import { DocumentAuditTrailEntity } from './entities/document-audit-trail.entity';
import { DocumentService } from './services/document.service';
import { DocumentInstanceService } from './services/document-instance.service';
import { DocumentTypeRegistryService } from './document-type-registry/document-type-registry.service';
import { PdfEngineService } from './pdf/pdf-engine.service';
import { DocumentSnapshotService } from './services/document-snapshot.service';
import { AuditTrailListener } from './services/audit-trail.listener';

import { DocumentOverrideService } from './services/document-override.service';
import { DefaultSignatureProvider } from './services/default-signature-provider.service';
import { PdfArchivalService } from './services/pdf-archival.service';

/**
 * DocumentEngineModule — the generic Document Engine (ADR-001, ADR-002).
 * Milestone 1: entities for the full Phase 4A §2.2 schema, plus DocumentService
 * (documents/draft versions) and DocumentTypeRegistryService.
 * Milestone 4: DocumentInstanceService (fill/submit lifecycle for
 * document_instances) and PdfEngineService (generic PDF dispatch per
 * DocumentTypeDefinition.pdfRenderer — Phase 4A §2.1, ADR-002).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentEntity,
      DocumentVersionEntity,
      DocumentOverrideEntity,
      DocumentOverrideVersionEntity,
      DocumentInstanceEntity,
      DocumentSnapshotEntity,
      DocumentSignatureEntity,
      DocumentAuditTrailEntity,
    ]),
  ],
  providers: [
    DocumentService, 
    DocumentInstanceService, 
    DocumentTypeRegistryService, 
    PdfEngineService, 
    DocumentOverrideService,
    PdfArchivalService,
    DocumentSnapshotService,
    AuditTrailListener,
    {
      provide: 'ISignatureProvider',
      useClass: DefaultSignatureProvider,
    },
  ],
  exports: [
    DocumentService, 
    DocumentInstanceService, 
    DocumentTypeRegistryService, 
    PdfEngineService, 
    DocumentOverrideService,
    PdfArchivalService,
    DocumentSnapshotService,
    'ISignatureProvider',
  ],
})
export class DocumentEngineModule {}
