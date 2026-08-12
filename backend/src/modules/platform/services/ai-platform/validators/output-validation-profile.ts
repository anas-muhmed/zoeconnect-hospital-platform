export enum ValidationProfileType {
  STRUCTURED_OUTPUT = 'STRUCTURED_OUTPUT',
  CLINICAL_SUMMARY = 'CLINICAL_SUMMARY',
  OCR_CLEANUP = 'OCR_CLEANUP',
  DOCUMENT_GENERATION = 'DOCUMENT_GENERATION',
}

export interface ValidationProfile {
  profileType: ValidationProfileType;
  requiredValidators: string[];
  blocking: boolean;
}

export const ValidationProfiles: Record<ValidationProfileType, ValidationProfile> = {
  [ValidationProfileType.STRUCTURED_OUTPUT]: {
    profileType: ValidationProfileType.STRUCTURED_OUTPUT,
    requiredValidators: ['JSON_SCHEMA', 'ZOD', 'BUSINESS_RULES'],
    blocking: true,
  },
  [ValidationProfileType.CLINICAL_SUMMARY]: {
    profileType: ValidationProfileType.CLINICAL_SUMMARY,
    requiredValidators: ['CLINICAL_RULES', 'CITATION', 'CONFIDENCE'],
    blocking: true, // Bad summaries are dangerous
  },
  [ValidationProfileType.OCR_CLEANUP]: {
    profileType: ValidationProfileType.OCR_CLEANUP,
    requiredValidators: ['JSON_SCHEMA'],
    blocking: false, // Fall back to raw text if structure fails
  },
  [ValidationProfileType.DOCUMENT_GENERATION]: {
    profileType: ValidationProfileType.DOCUMENT_GENERATION,
    requiredValidators: ['BUSINESS_RULES'],
    blocking: true,
  },
};
