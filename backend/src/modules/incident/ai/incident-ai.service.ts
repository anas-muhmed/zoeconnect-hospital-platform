import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

/**
 * IncidentAiService — AI extension point (stub implementation).
 *
 * This interface is intentionally empty in v1. It exists as a clean seam
 * so that future AI integration (local LLM, Vertex AI, OpenAI) never
 * requires breaking service-layer changes in IncidentService.
 *
 * All methods throw NotImplementedException with a descriptive message.
 * Once an AI provider is integrated, replace the stub implementations
 * with actual calls — zero changes needed elsewhere in the incident module.
 *
 * The AI service is registered in IncidentModule but NOT injected into
 * any other service in v1 — it is only available via the REST endpoint
 * /incident/ai/* for future use.
 */
@Injectable()
export class IncidentAiService {
  private readonly logger = new Logger(IncidentAiService.name);

  /**
   * Classify incident into category/type from free-text description.
   * Future: POST description → LLM → { categoryCode, typeCode, confidence }
   */
  async classifyIncident(_description: string): Promise<never> {
    throw new NotImplementedException('AI classification is not yet implemented in this version of ZoeConnect');
  }

  /**
   * Predict incident severity from description and patient/department context.
   * Future: POST context → LLM → { predictedSeverity, confidence, reasoning }
   */
  async predictSeverity(_context: Record<string, unknown>): Promise<never> {
    throw new NotImplementedException('AI severity prediction is not yet implemented in this version of ZoeConnect');
  }

  /**
   * Suggest root causes from incident description and category.
   * Future: POST incident summary → LLM → { suggestedRootCauses[] }
   */
  async suggestRootCauses(_incidentId: string): Promise<never> {
    throw new NotImplementedException('AI RCA suggestion is not yet implemented in this version of ZoeConnect');
  }

  /**
   * Suggest corrective actions from confirmed root causes.
   * Future: POST rootCauses → LLM → { suggestedCapas[] }
   */
  async suggestCapa(_rcaId: string): Promise<never> {
    throw new NotImplementedException('AI CAPA suggestion is not yet implemented in this version of ZoeConnect');
  }
}
