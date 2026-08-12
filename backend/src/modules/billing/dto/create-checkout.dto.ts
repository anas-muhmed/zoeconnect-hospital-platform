import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCheckoutDto {
  @ApiProperty({ description: 'A previously created, READY, unexpired quote id. The backend re-validates ownership, status, expiry and hash -- never trusts anything else about the quote from the client.' })
  @IsUUID()
  quoteId: string;
}
