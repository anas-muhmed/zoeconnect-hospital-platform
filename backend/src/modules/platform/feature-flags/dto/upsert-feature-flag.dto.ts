import {
  IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min,
} from 'class-validator';
import { FeatureFlagState } from '../entities/feature-flag.entity';

/**
 * UpsertFeatureFlagDto (Phase 11, Task 11.4 — admin API).
 *
 * `tenantId: undefined`/omitted means "set the platform-wide default row"
 * (`tenant_id IS NULL`) — not a per-tenant override. This mirrors
 * `FeatureFlagsService.setFlag()`'s own `tenantId: string | null` contract.
 */
export class UpsertFeatureFlagDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsString()
  featureKey: string;

  @IsIn(['enabled', 'disabled', 'beta'])
  state: FeatureFlagState;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercentage?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
