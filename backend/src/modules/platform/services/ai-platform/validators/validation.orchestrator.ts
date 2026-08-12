import { Injectable, Logger } from '@nestjs/common';
import { AiExecutionResult } from '../interfaces/ai-execution.interface';
import { IOutputValidator } from './output-validator.interface';
import { ValidationProfileType, ValidationProfiles } from './output-validation-profile';
import { AiValidationException } from '../exceptions/ai-exceptions';

@Injectable()
export class ValidationOrchestrator {
  private readonly logger = new Logger(ValidationOrchestrator.name);
  private validators = new Map<string, IOutputValidator>();

  registerValidator(validator: IOutputValidator) {
    this.validators.set(validator.name, validator);
  }

  async validate(result: AiExecutionResult, profileType: ValidationProfileType): Promise<void> {
    const profile = ValidationProfiles[profileType];
    this.logger.debug(`Running Validation Profile: ${profileType}`);

    for (const validatorName of profile.requiredValidators) {
      const validator = this.validators.get(validatorName);
      if (!validator) {
        this.logger.warn(`Validator ${validatorName} not registered, skipping.`);
        continue;
      }

      const validationResult = await validator.validate(result.structuredOutput || result.output, {});
      if (!validationResult.isValid) {
        if (profile.blocking) {
          throw new AiValidationException(`Validation failed for profile ${profileType} at ${validatorName}`);
        } else {
          this.logger.warn(`Validation warning for profile ${profileType} at ${validatorName}`);
          result.safetyFlags[`validation_${validatorName}_failed`] = true;
        }
      }
    }
  }
}
