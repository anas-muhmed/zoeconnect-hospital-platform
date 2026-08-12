import {
  IsUUID, IsString, IsNotEmpty, IsOptional, MaxLength, Matches,
} from 'class-validator';

export class SaveWorkstationConfigDto {
  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsUUID()
  locationId: string;

  // Either a real TokenCounter UUID, or a synthetic "new:<counterNumber>"
  // slot from GET options/counters (see WorkstationService.listCounters) --
  // the latter is find-or-created into a real counter row on save.
  @IsString()
  @Matches(/^(new:\d+|[0-9a-fA-F-]{36})$/, {
    message: 'counterId must be a UUID or a new:<counterNumber> slot',
  })
  counterId: string;

  /**
   * Optional display label for who configured this workstation --
   * resolved client-side by the Registration Assistant via
   * GET /his/user-context (HIS username -> mapped ZoeConnect user's full name),
   * when a mapping exists. Purely a display/audit convenience, same as the
   * pre-existing 'walk-up' default it replaces when present -- see
   * WorkstationConfig.configuredBy's own docstring ("audit convenience
   * only, not an access-control value"). Never used for authorization;
   * the walk-up save path remains open to anyone physically at the
   * workstation regardless of what's passed here, exactly as before this
   * field existed.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  configuredByLabel?: string;
}

export class SetWorkstationLockDto {
  locked: boolean;
}
