import { IsString, MinLength, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateKioskPairingDto {
  /** e.g. "http://hdsp-server/token/print-kiosk?branchId=..." or "/kiosk/<slug>" (resolved against the tenant's own frontend origin by the kiosk if given as a relative path). */
  @IsString()
  @MinLength(1)
  kioskUrl: string;

  @IsOptional()
  @IsString()
  label?: string;

  /** Activation code validity window, in hours. Defaults to 72h -- long enough for IT to get to the till, short enough that a leaked/unused code doesn't stay redeemable indefinitely. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  expiresInHours?: number;
}
