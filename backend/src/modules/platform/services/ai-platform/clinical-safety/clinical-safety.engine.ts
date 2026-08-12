import { Injectable, Logger } from '@nestjs/common';
import { AiExecutionResult } from '../interfaces/ai-execution.interface';
import { AiSafetyException } from '../exceptions/ai-exceptions';

export interface ClinicalSafetyResult {
  isSafe: boolean;
  violations: string[];
  warnings: string[];
}

export interface IClinicalSafetyRule {
  readonly id: string;
  readonly name: string;
  evaluate(result: AiExecutionResult, context: any): Promise<ClinicalSafetyResult>;
}

@Injectable()
export class ClinicalSafetyEngine {
  private readonly logger = new Logger(ClinicalSafetyEngine.name);
  private rules: IClinicalSafetyRule[] = [];

  registerRule(rule: IClinicalSafetyRule) {
    this.rules.push(rule);
    this.logger.log(`Registered Clinical Safety Rule: ${rule.name}`);
  }

  async evaluateSafety(result: AiExecutionResult, context: any): Promise<void> {
    this.logger.debug(`Evaluating clinical safety using ${this.rules.length} rules...`);
    
    let isSafe = true;
    let allViolations: string[] = [];
    let allWarnings: string[] = [];

    for (const rule of this.rules) {
      const evaluation = await rule.evaluate(result, context);
      if (!evaluation.isSafe) {
        isSafe = false;
        allViolations.push(...evaluation.violations);
      }
      allWarnings.push(...evaluation.warnings);
    }

    // Attach warnings to result flags
    if (allWarnings.length > 0) {
      result.safetyFlags['warnings'] = true;
      this.logger.warn(`Clinical Safety Warnings: ${allWarnings.join('; ')}`);
    }

    if (!isSafe) {
      this.logger.error(`Clinical Safety Violations: ${allViolations.join('; ')}`);
      throw new AiSafetyException(`Output failed clinical safety checks: ${allViolations[0]}`, { violations: allViolations });
    }
  }
}
