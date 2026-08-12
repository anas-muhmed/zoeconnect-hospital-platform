import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMortuaryBodyReleaseDto {
  @IsString() @IsNotEmpty() bodyId: string;
  @IsIn(['MLC', 'NON_MLC']) caseType: 'MLC' | 'NON_MLC';

  @IsOptional() @IsString() bodyTakenBy?: string;
  @IsOptional() @IsString() relationship?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() contactNumber?: string;
  @IsOptional() @IsString() policeStationName?: string;
  @IsOptional() @IsString() siName?: string;

  /**
   * Object-repository storage keys for the NOC/legal documents (Stage E).
   * Stage C accepts them as already-uploaded references only — no upload
   * handling exists in this stage.
   */
  @IsOptional() @IsString() nocDocumentObjectKey?: string;
  @IsOptional() @IsString() legalDocumentsObjectKey?: string;
}
