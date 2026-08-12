export interface OutputValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedOutput?: any;
}

export interface IOutputValidator {
  readonly id: string;
  readonly name: string;
  
  /**
   * Validates the AI output.
   */
  validate(output: any, context: any): Promise<OutputValidationResult>;
}
