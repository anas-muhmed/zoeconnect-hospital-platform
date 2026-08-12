import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceProfileEntity } from './entities/compliance-profile.entity';
import { DocumentSignatureEntity } from './entities/document-signature.entity';
import { EvidenceChainEntity } from './entities/evidence-chain.entity';
import { ComplianceValidatorService } from './services/compliance-validator.service';
import { DocumentRenderingEngineService } from './services/document-rendering-engine.service';
import { EvidenceChainListener } from './services/evidence-chain.listener';
import { IntegrityEngineService } from './services/integrity-engine.service';
import { SignatureFrameworkService } from './services/signature-framework.service';
import { PdfDocumentRenderer } from './services/renderers/pdf-document.renderer';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComplianceProfileEntity,
      DocumentSignatureEntity,
      EvidenceChainEntity,
    ]),
  ],
  providers: [
    ComplianceValidatorService,
    DocumentRenderingEngineService,
    EvidenceChainListener,
    IntegrityEngineService,
    SignatureFrameworkService,
    PdfDocumentRenderer,
  ],
  exports: [
    ComplianceValidatorService,
    DocumentRenderingEngineService,
    IntegrityEngineService,
    SignatureFrameworkService,
  ],
})
export class ComplianceEngineModule {
  constructor(
    private readonly renderingEngine: DocumentRenderingEngineService,
    private readonly pdfRenderer: PdfDocumentRenderer
  ) {
    this.renderingEngine.registerRenderer(this.pdfRenderer);
  }
}
