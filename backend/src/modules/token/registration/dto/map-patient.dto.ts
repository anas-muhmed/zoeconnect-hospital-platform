import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class MapPatientDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  tokenNumber: string;

  /**
   * Optional for backward compatibility with the original in-widget mapping
   * path (a fully-authenticated receptionist session, which is trusted by
   * permission alone). REQUIRED and enforced when the caller is
   * authenticated via a reservation-capability token (the popup-window
   * architecture) -- see ReservationScopeGuard, which rejects any
   * capability-authenticated call missing this field or whose value doesn't
   * match the token it was minted for.
   */
  @IsUUID()
  @IsOptional()
  reservationId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  hisPatientId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  mrn: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  patientName?: string;

  /** visit_id from HIS -- null for demographic-only registrations */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  visitId?: string;

  /**
   * The real HIS registrar's username/display name, when the caller
   * authenticating this request is a shared/technical identity (a
   * workstation session token, or a server-to-server service account) that
   * itself carries no human identity. Read straight off the HIS page's own
   * DOM (see PatientRegistration_HDSP.xhtml's hdspReadHisUsername()) and
   * passed through here so `mapped_by` / `token_records.registration_user`
   * / `mapping_audit_log.actor` reflect the actual registrar, not just
   * "workstation" or a shared service account name. Ignored (not required)
   * for a normal, fully-authenticated receptionist session, where the
   * session's own identity is already correct.
   */
  @IsString()
  @IsOptional()
  @MaxLength(150)
  registeredByHisUser?: string;
}

export class MapVisitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  tokenNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  visitId: string;
}
