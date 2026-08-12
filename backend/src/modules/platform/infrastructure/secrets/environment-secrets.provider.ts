import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISecretsProvider } from './secrets.interface';

@Injectable()
export class EnvironmentSecretsProvider implements ISecretsProvider {
  constructor(private readonly configService: ConfigService) {}

  async getSecret(key: string): Promise<string | undefined> {
    // Converts e.g. "gemini.apiKey" to "GEMINI_API_KEY" convention
    const envKey = key.replace(/\./g, '_').toUpperCase();
    return this.configService.get<string>(envKey);
  }
}
