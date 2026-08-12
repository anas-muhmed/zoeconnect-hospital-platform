export enum EicAssessmentStatus {
  DRAFT               = 'DRAFT',
  SUBMITTED           = 'SUBMITTED',
  UNDER_REVIEW        = 'UNDER_REVIEW',
  REVISION_REQUESTED  = 'REVISION_REQUESTED',
  FINALISED           = 'FINALISED',
}

export enum EicGoalStatus {
  ACTIVE          = 'ACTIVE',
  ACHIEVED        = 'ACHIEVED',
  DISCONTINUED    = 'DISCONTINUED',
  CARRIED_FORWARD = 'CARRIED_FORWARD',
}

export enum EicGoalType {
  SHORT_TERM = 'SHORT_TERM',
  LONG_TERM  = 'LONG_TERM',
}

export enum EicSessionStatus {
  DRAFT     = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  CANCELLED = 'CANCELLED',
}

export enum EicReportStatus {
  IN_PROGRESS        = 'IN_PROGRESS',
  PENDING_SIGNATURE  = 'PENDING_SIGNATURE',
  SIGNED             = 'SIGNED',
  PUBLISHED          = 'PUBLISHED',
}

export enum EicSectionStatus {
  PENDING              = 'PENDING',
  SUBMITTED            = 'SUBMITTED',
  AMENDMENT_REQUESTED  = 'AMENDMENT_REQUESTED',
}

export enum EicDischargeStatus {
  DRAFT              = 'DRAFT',
  PENDING_SECTIONS   = 'PENDING_SECTIONS',
  PENDING_SIGNATURE  = 'PENDING_SIGNATURE',
  SIGNED             = 'SIGNED',
}
