import { Injectable, Logger } from '@nestjs/common';

export interface KnowledgeDocumentMetadata {
  documentId: string;
  version: number;
  status: 'ACTIVE' | 'ARCHIVED' | 'REVOKED';
  sourceTrustScore: number; // 0-100
  expirationDate?: Date;
  requiredPermissions: string[];
}

@Injectable()
export class KnowledgeValidationService {
  private readonly logger = new Logger(KnowledgeValidationService.name);

  async validateDocumentForContext(documentMetadata: KnowledgeDocumentMetadata, userContext: any): Promise<boolean> {
    this.logger.debug(`Validating Knowledge Document ${documentMetadata.documentId} before prompt injection...`);

    if (documentMetadata.status !== 'ACTIVE') {
      this.logger.warn(`Document ${documentMetadata.documentId} is ${documentMetadata.status}`);
      return false;
    }

    if (documentMetadata.expirationDate && documentMetadata.expirationDate < new Date()) {
      this.logger.warn(`Document ${documentMetadata.documentId} has expired`);
      return false;
    }

    if (documentMetadata.sourceTrustScore < 70) {
      this.logger.warn(`Document ${documentMetadata.documentId} has insufficient trust score (${documentMetadata.sourceTrustScore})`);
      return false;
    }

    // Scaffold: Check if userContext.permissions contains all requiredPermissions
    return true;
  }
}
