import { IsString, IsUUID, IsNotEmpty } from 'class-validator';

export class ReserveTokenDto {
  /** Client-generated UUID -- created at Confirm click, stored in React state */
  @IsUUID()
  reservationId: string;
}

export class HeartbeatDto {
  @IsUUID()
  reservationId: string;
}

export class ReleaseTokenDto {
  @IsUUID()
  reservationId: string;
}

export class SupervisorResetDto {
  @IsString()
  @IsNotEmpty()
  targetStatus: 'CALLED' | 'WAITING';

  @IsString()
  @IsNotEmpty()
  reason: string;
}
