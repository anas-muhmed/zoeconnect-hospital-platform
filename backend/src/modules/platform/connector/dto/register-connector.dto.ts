import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * D.6 ("Onboarding UX," 2026-07-22): `tenantCode` is now optional --
 * see `ConnectorRegistrationService.register()`'s doc comment for why a
 * hospital IT user entering just an Activation Code (no separate tenant
 * identifier) is sufficient. `pairingKey` renamed to `activationCode` to
 * match the new terminology throughout the onboarding flow (this is a
 * first-party wire contract between this backend and the Connector
 * process, both updated together -- not a public/external API).
 */
export class RegisterConnectorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  tenantCode?: string;

  @IsString()
  @MinLength(1)
  activationCode: string;

  /** Optional, purely informational (self-reported by the installer). */
  hostname?: string;
}
