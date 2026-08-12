import { Injectable } from '@nestjs/common';
import { IOutputValidator, OutputValidationResult } from './output-validator.interface';

@Injectable()
export class JsonSchemaValidator implements IOutputValidator {
  public readonly id = 'json-schema-validator';
  public readonly name = 'JSON Schema Validator';

  async validate(output: any, context: any): Promise<OutputValidationResult> {
    // In V1, this would use Ajv or a similar library to validate `output` against `context.expectedSchema`
    if (!context.expectedSchema) {
      return { isValid: true, errors: [] }; // Nothing to validate against
    }

    // Mock validation logic
    const isValid = typeof output === 'object';
    return {
      isValid,
      errors: isValid ? [] : ['Output is not a valid JSON object matching the schema.'],
      sanitizedOutput: output,
    };
  }
}
