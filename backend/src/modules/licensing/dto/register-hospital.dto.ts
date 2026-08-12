import { IsString, IsNotEmpty, IsNumber, IsUrl, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterHospitalDto {
  @ApiProperty({ example: 'http://192.168.1.50:4000', description: 'Base URL of the vendor platform API' })
  @IsUrl({ require_tld: false })
  vendorApiUrl: string;

  @ApiProperty({ example: '203.0.113.45', description: "This hospital server's public IP" })
  @IsString() @IsNotEmpty()
  publicIp: string;

  @ApiProperty({ example: 3000, description: 'Port on which ZoeConnect backend is publicly reachable' })
  @IsNumber() @Min(1) @Max(65535)
  publicPort: number;

  @ApiProperty({ example: 'General Hospital', description: 'Name of the hospital registering' })
  @IsString() @IsNotEmpty()
  hospitalName: string;

  @ApiProperty({ example: 'GH01', description: 'Short code for the hospital' })
  @IsString() @IsNotEmpty()
  hospitalCode: string;
}
