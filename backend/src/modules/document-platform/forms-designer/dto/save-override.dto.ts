import { IsString, IsIn, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Operation } from 'fast-json-patch';

export class SaveOverrideDto {
  @ApiProperty({ description: 'Scope of the override', enum: ['branch', 'department'] })
  @IsString()
  @IsIn(['branch', 'department'])
  scope: 'branch' | 'department';

  @ApiProperty({ description: 'Branch ID', required: false })
  @IsString()
  @IsOptional()
  branchId?: string;

  @ApiProperty({ description: 'Department Code', required: false })
  @IsString()
  @IsOptional()
  departmentCode?: string;

  @ApiProperty({ description: 'RFC 6902 JSON Patches' })
  @IsArray()
  patches: Operation[];
}
