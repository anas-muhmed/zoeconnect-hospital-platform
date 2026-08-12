import { IsString, IsNotEmpty, IsOptional, ValidateIf, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * ZoeConnect Identity Architecture Migration, Phase 3.
 *
 * `identifier` is the preferred field going forward -- username or email,
 * resolved by `AuthService.login()` as `identifier ?? username`. `username`
 * is retained, unenforced when `identifier` is supplied, purely so existing
 * API callers/scripts sending the old `{ username, password }` shape keep
 * working with zero changes on their end.
 *
 * Exactly one of `identifier`/`username` must be present: `@ValidateIf`
 * below makes `username`'s own validators (`IsString`/`IsNotEmpty`) run only
 * when `identifier` is absent, so a request with neither field still fails
 * validation the same way a request with no `username` always has.
 */
export class LoginDto {
  @ApiProperty({
    example: 'superadmin',
    required: false,
    description: 'Preferred field -- username or email. Case-insensitive when AUTH_IDENTITY_MODE=global.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  identifier?: string;

  @ApiProperty({
    example: 'superadmin',
    required: false,
    description: 'Legacy field, retained for backward compatibility. Ignored when `identifier` is supplied.',
  })
  @ValidateIf((o: LoginDto) => !o.identifier)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username?: string;

  @ApiProperty({ example: 'Admin@1234!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
