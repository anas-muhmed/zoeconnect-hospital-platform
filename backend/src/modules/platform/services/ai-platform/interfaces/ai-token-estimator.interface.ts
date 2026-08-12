export interface ITokenEstimator {
  estimateTokens(prompt: string, context?: any): number;
}
