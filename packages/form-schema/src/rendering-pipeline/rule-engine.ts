import type { RuleExpression } from '../schema/form-schema.types';

/**
 * A custom AST Evaluator that deterministicly evaluates RuleExpressions on both client and server,
 * strictly prohibiting eval() or new Function() (ADR-012/Security).
 */
export class RuleEngine {
  /**
   * Evaluates a single RuleExpression against a data context.
   */
  static evaluate(expr: RuleExpression | null | undefined, context: Record<string, any>): any {
    if (!expr) return null;

    switch (expr.op) {
      case 'CONST':
        return expr.value;
      
      case 'FIELD':
        return context[expr.field];
      
      case 'VAR': {
        // Evaluate dot-notation path like 'patient.age'
        const parts = expr.path.split('.');
        let val = context;
        for (const p of parts) {
          if (val == null) return null;
          val = val[p];
        }
        return val;
      }
      
      case 'IF': {
        const condVal = this.evaluate(expr.cond, context);
        return condVal ? this.evaluate(expr.then, context) : (expr.else ? this.evaluate(expr.else, context) : null);
      }
      
      case 'AND':
        return expr.args.every(arg => !!this.evaluate(arg, context));
      
      case 'OR':
        return expr.args.some(arg => !!this.evaluate(arg, context));
      
      case 'NOT':
        return !this.evaluate(expr.arg, context);
      
      case 'EQ':
        return this.evaluate(expr.left, context) === this.evaluate(expr.right, context);
      
      case 'NEQ':
        return this.evaluate(expr.left, context) !== this.evaluate(expr.right, context);
      
      case 'GT':
        return this.evaluate(expr.left, context) > this.evaluate(expr.right, context);
      
      case 'GTE':
        return this.evaluate(expr.left, context) >= this.evaluate(expr.right, context);
      
      case 'LT':
        return this.evaluate(expr.left, context) < this.evaluate(expr.right, context);
      
      case 'LTE':
        return this.evaluate(expr.left, context) <= this.evaluate(expr.right, context);
      
      case 'SUM': {
        const arr = context[expr.field];
        if (!Array.isArray(arr)) return null;
        return arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
      }
      
      case 'AVG': {
        const arr = context[expr.field];
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const sum = arr.reduce((acc, v) => acc + (Number(v) || 0), 0);
        return sum / arr.length;
      }
      
      case 'MIN': {
        const arr = context[expr.field];
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return Math.min(...arr.map(v => Number(v) || 0));
      }
      
      case 'MAX': {
        const arr = context[expr.field];
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return Math.max(...arr.map(v => Number(v) || 0));
      }
      
      case 'COUNT': {
        const arr = context[expr.field];
        if (!Array.isArray(arr)) return null;
        return arr.length;
      }
      
      default:
        throw new Error(`RuleEngine: Unknown operator ${(expr as any).op}`);
    }
  }
}
