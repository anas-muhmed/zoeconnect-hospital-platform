import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ImportJobEntity } from './entities/import-job.entity';
import { FormsImportService } from './forms-import.service';
import { FormsImportController } from './forms-import.controller';
import { TesseractOcrProvider } from './ocr/tesseract-ocr.provider';
import { LayoutAnalyzer } from './layout/layout-analyzer';
import { GeminiClassifierProvider } from './classifier/gemini-classifier.provider';
import { RuleBasedClassifierProvider } from './classifier/rule-based-classifier.provider';
import { SemanticClassifier } from './classifier/semantic-classifier';
import { SchemaGenerator } from './schema-gen/schema-generator';
import { SuggestionEngine } from './suggestions/suggestion-engine';
import { DocumentEngineModule } from '../document-engine/document-engine.module';
import { PlatformInfrastructureModule } from '../../platform/infrastructure/platform-infrastructure.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportJobEntity]),
    MulterModule.register({ storage: undefined }), // use memoryStorage (default) — buffer only, no disk
    DocumentEngineModule,
    PlatformInfrastructureModule, // provides SECRETS_PROVIDER for GeminiClassifierProvider
  ],
  providers: [
    FormsImportService,
    TesseractOcrProvider,
    LayoutAnalyzer,
    GeminiClassifierProvider,
    RuleBasedClassifierProvider,
    SemanticClassifier,
    SchemaGenerator,
    SuggestionEngine,
  ],
  controllers: [FormsImportController],
  exports: [FormsImportService],
})
export class FormsImportModule {}
