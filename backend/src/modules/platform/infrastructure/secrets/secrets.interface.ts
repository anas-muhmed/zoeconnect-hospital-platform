export interface ISecretsProvider {
  /**
   * Retrieves a secret by key (e.g., 'gemini.apiKey')
   */
  getSecret(key: string): Promise<string | undefined>;
}
