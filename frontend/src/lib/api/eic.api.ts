import { apiClient } from './client';

// ── Enums ──────────────────────────────────────────────────────────────────────

export type EicDiscipline = 'BT' | 'SLP' | 'DT' | 'OT' | 'SE' | 'PRESCHOOL';

export const DISCIPLINE_LABELS: Record<EicDiscipline, string> = {
  BT:        'Behaviour Therapy',
  SLP:       'Speech-Language Pathology',
  DT:        'Developmental Therapy',
  OT:        'Occupational Therapy',
  SE:        'Special Education',
  PRESCHOOL: 'Preschool',
};

export type EicEnrollmentStatus = 'INITIATED' | 'ACTIVE' | 'ON_HOLD' | 'DISCHARGED' | 'CLOSED';
export type EicAssessmentStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'REVISION_REQUESTED' | 'FINALISED';
export type EicGoalStatus       = 'ACTIVE' | 'ACHIEVED' | 'DISCONTINUED' | 'CARRIED_FORWARD';
export type EicGoalType         = 'SHORT_TERM' | 'LONG_TERM';
export type EicSessionStatus    = 'DRAFT' | 'SUBMITTED' | 'CANCELLED';
export type EicReportStatus     = 'IN_PROGRESS' | 'PENDING_SIGNATURE' | 'SIGNED' | 'PUBLISHED';
export type EicDischargeStatus  = 'DRAFT' | 'PENDING_SECTIONS' | 'PENDING_SIGNATURE' | 'SIGNED';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface EicPatient {
  id: string;
  mrn: string;
  fullName: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  ageYears: number | null;
  ageMonths: number | null;
  mobile: string | null;
  email: string | null;
  fatherName: string | null;
  motherName: string | null;
  parentContact: string | null;
  referringDoctorName: string | null;
  isActive: boolean;
  hisSyncedAt: string | null;
  createdAt: string;
}

export interface EicTherapyEnrollment {
  id: string;
  patientId: string;
  enrollmentNumber: string;
  status: EicEnrollmentStatus;
  admissionDate: string;
  dischargeDate: string | null;
  activeDisciplines: EicDiscipline[];
  primaryDiagnosis: string | null;
  referralSource: string | null;
  notes: string | null;
  createdAt: string;
  patient?: EicPatient;
  teamMembers?: EicTeamMember[];
}

export interface EicTeamMember {
  id: string;
  enrollmentId: string;
  therapistId: string;
  therapistName: string;
  discipline: EicDiscipline;
  isActive: boolean;
  assignedAt: string;
  removedAt: string | null;
}

export interface EicAssessment {
  id: string;
  enrollmentId: string;
  discipline: EicDiscipline;
  assessmentType: string;
  status: EicAssessmentStatus;
  therapistId: string;
  therapistName: string;
  countersignedBy: string | null;
  countersignedAt: string | null;
  countersignNotes: string | null;
  submittedAt: string | null;
  finalisedAt: string | null;
  createdAt: string;
}

export interface EicGoal {
  id: string;
  assessmentId: string;
  enrollmentId: string;
  discipline: EicDiscipline;
  goalType: EicGoalType;
  goalText: string;
  targetDate: string | null;
  status: EicGoalStatus;
  achievedAt: string | null;
  achievementNotes: string | null;
  originalTargetDate: string | null;
  extendedTargetDate: string | null;
  extensionRemarks: string | null;
  extendedAt: string | null;
  sessionCount: number;
  displayOrder: number;
  createdAt: string;
}

export interface EicTherapySession {
  id: string;
  enrollmentId: string;
  discipline: EicDiscipline;
  sessionDate: string;
  sessionNumber: number | null;
  therapistId: string;
  therapistName: string;
  durationMinutes: number | null;
  attendance: string;
  sessionRemarks: string | null;
  status: EicSessionStatus;
  submittedAt: string | null;
  entries?: EicSessionEntry[];
  createdAt: string;
}

export interface EicSessionEntry {
  id: string;
  sessionId: string;
  goalId: string | null;
  goalText: string;
  activity: string;
  childResponse: string;
  remarks: string | null;
  displayOrder: number;
}

export interface EicProgressReport {
  id: string;
  enrollmentId: string;
  reportNumber: number;
  periodFrom: string;
  periodTo: string;
  status: EicReportStatus;
  signedBy: string | null;
  signedAt: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
  sectionsDueDate: string | null;
  reportDueDate: string | null;
  sections?: EicDisciplineProgressSection[];
  createdAt: string;
}

/** Work queue item — enriched with patient and enrollment info */
export interface EicWorkQueueItem {
  id: string;
  reportNumber: number;
  periodFrom: string;
  periodTo: string;
  status: EicReportStatus;
  sectionsDueDate: string | null;
  reportDueDate: string | null;
  createdAt: string;
  enrollmentId: string;
  enrollmentNumber: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  sections: Array<{ discipline: string; status: string; therapistId: string | null }>;
}

export interface EicDisciplineProgressSection {
  id: string;
  progressReportId: string;
  discipline: EicDiscipline;
  therapistId: string | null;
  therapistName: string | null;
  status: 'PENDING' | 'SUBMITTED' | 'AMENDMENT_REQUESTED';
  sessionsHeld: number | null;
  goalsAchieved: number | null;
  goalsInProgress: number | null;
  functionalProgress: string | null;
  recommendations: string | null;
  submittedAt: string | null;
  sectionData?: Record<string, any>;
}

export interface EicDevelopmentalHistory {
  id: string;
  patientId: string;
  pregnancyType: string | null;
  antenatalComplications: string[];
  maternalAgeAtBirth: number | null;
  deliveryType: string | null;
  gestationalAgeWeeks: number | null;
  birthWeightKg: number | null;
  birthCry: boolean | null;
  nicuStay: boolean | null;
  nicuDurationDays: number | null;
  birthComplications: string[];
  postnatalJaundice: boolean | null;
  postnatalSeizures: boolean | null;
  postnatalOther: string | null;
  neckHoldingMonths: number | null;
  sittingMonths: number | null;
  standingMonths: number | null;
  walkingMonths: number | null;
  firstWordsMonths: number | null;
  phrasesMonths: number | null;
  sentencesMonths: number | null;
  diagnosis: string | null;
  coMorbidities: string[];
  currentMedications: string | null;
  previousTherapy: string | null;
  familyHistory: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EicDischargeSummary {
  id: string;
  enrollmentId: string;
  dischargeReason: string;
  dischargeDate: string;
  status: EicDischargeStatus;
  overallProgress: string | null;
  homeProgramme: string | null;
  followUpPlan: string | null;
  signedBy: string | null;
  signedAt: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
  sections?: EicDischargeSection[];
  createdAt: string;
}

export interface EicPreschoolEnrollment {
  id: string;
  patientId: string;
  enrollmentNumber: string;
  admissionDate: string;
  dischargeDate: string | null;
  classGroup: string | null;
  teacherId: string | null;
  teacherName: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  patient?: EicPatient;
  assessment?: EicPreschoolAssessment;
}

export interface EicPreschoolAssessment {
  id: string;
  preschoolEnrollmentId: string;
  assessmentDate: string;
  assessedBy: string | null;
  assessorName: string | null;
  languageCommunication: Record<string, unknown>;
  adlSelfHelp: Record<string, unknown>;
  socialEmotional: Record<string, unknown>;
  preAcademic: Record<string, unknown>;
  conceptualUnderstanding: Record<string, unknown>;
  grossMotor: Record<string, unknown>;
  fineMotor: Record<string, unknown>;
  recommendations: string | null;
  goals: Array<{ text: string; targetDate?: string }>;
  status: string;
  isCurrent: boolean;
  assessmentNumber: number;
  createdAt: string;
}

export interface EicPreschoolDailyReport {
  id: string;
  preschoolEnrollmentId: string;
  reportDate: string;
  attendance: string;
  moodOnArrival: string | null;
  participationLevel: string | null;
  overallDayRating: string | null;
  curriculumActivities: Array<{ activity: string; participation: string; remarks?: string }>;
  adlPerformance: Record<string, string>;
  behaviourObservations: string | null;
  homePractice: string | null;
  teacherRemarks: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface EicDischargeSection {
  id: string;
  dischargeId: string;
  discipline: EicDiscipline;
  status: 'PENDING' | 'SUBMITTED' | 'AMENDMENT_REQUESTED';
  totalSessions: number | null;
  goalsAchieved: number | null;
  functionalOutcomes: string | null;
  recommendations: string | null;
  sectionData: Record<string, unknown> | null;
}

// ── API Client ─────────────────────────────────────────────────────────────────

const BASE = '/eic';

export const eicApi = {
  // ── Patients ─────────────────────────────────────────────────────────────────
  listPatients: (q?: string) =>
    apiClient.get<EicPatient[]>(`${BASE}/patients`, { params: q ? { q } : {} }).then((r) => r.data),

  getDevelopmentalHistory: (patientId: string) =>
    apiClient.get<EicDevelopmentalHistory | null>(`${BASE}/patients/${patientId}/developmental-history`).then((r) => r.data),

  getPatientEnrollments: (patientId: string) =>
    apiClient.get<EicTherapyEnrollment[]>(`${BASE}/patients/${patientId}/enrollments`).then((r) => r.data),

  getSyncStatus: () =>
    apiClient.get<{
      summary: { total: number; synced: number; neverSynced: number; lastSyncAt: string | null };
      patients: Array<{ id: string; mrn: string; fullName: string; isActive: boolean; hisSyncedAt: string | null }>;
    }>(`${BASE}/patients/sync-status`).then((r) => r.data),

  batchSyncAllPatients: () =>
    apiClient.post<{ queued: boolean; totalPatients: number; message: string }>(
      `${BASE}/patients/sync-all`,
    ).then((r) => r.data),

  diagnoseHis: () =>
    apiClient.get<{
      oracleConnected: boolean;
      configKeysLoaded: number;
      syncSqlConfigured: boolean;
      hint: string | null;
      oracle?: { invoiceTableRowCount: number | null; sampleStatuses: string[] | null; testQueryError: string | null };
    }>('/his/sync/diagnose').then((r) => r.data),

  /** Typeahead: partial doctor name → list of HIS doctors (for therapist autocomplete) */
  doctorsSuggest: (q?: string) =>
    apiClient.get<Array<{
      doctorCode: string; doctorName: string; specialization: string;
      departmentName: string; qualification: string | null;
    }>>(`${BASE}/patients/doctors-suggest`, { params: q ? { q } : {} }).then((r) => r.data),

  /** Typeahead: partial MRN or name → lightweight suggestion list from HIS */
  hisSuggest: (q: string, limit = 10) =>
    apiClient.get<Array<{
      mrn: string; fullName: string; gender: string;
      dateOfBirth: string; mobile: string | null;
    }>>(`${BASE}/patients/his-suggest`, { params: { q, limit } }).then((r) => r.data),

  /** Exact MRN lookup — returns full HIS data + existing EIC record */
  searchByMrn: (mrn: string) =>
    apiClient.get<{ hisData: unknown; eicPatient: EicPatient | null }>(
      `${BASE}/patients/search`, { params: { mrn } },
    ).then((r) => r.data),

  createPatientManual: (data: {
    mrn: string;
    firstName: string;
    lastName: string;
    salutation?: string;
    middleName?: string;
    gender?: string;
    dateOfBirth?: string;
    mobile?: string;
    email?: string;
    fatherName?: string;
    motherName?: string;
    parentContact?: string;
    parentEmail?: string;
    referringDoctorName?: string;
  }) => apiClient.post<EicPatient>(`${BASE}/patients/manual`, data).then((r) => r.data),

  getPatient: (id: string) =>
    apiClient.get<EicPatient>(`${BASE}/patients/${id}`).then((r) => r.data),

  syncFromHis: (id: string) =>
    apiClient.post<EicPatient>(`${BASE}/patients/${id}/sync-his`).then((r) => r.data),

  saveDevelopmentalHistory: (id: string, data: Record<string, unknown>) =>
    apiClient.put(`${BASE}/patients/${id}/developmental-history`, data).then((r) => r.data),

  // ── Enrollments ───────────────────────────────────────────────────────────────
  createEnrollment: (data: {
    mrn: string;
    admissionDate: string;
    activeDisciplines: EicDiscipline[];
    primaryDiagnosis?: string;
    referralSource?: string;
    notes?: string;
  }) => apiClient.post<EicTherapyEnrollment>(`${BASE}/enrollments`, data).then((r) => r.data),

  getEnrollment: (id: string) =>
    apiClient.get<EicTherapyEnrollment>(`${BASE}/enrollments/${id}`).then((r) => r.data),

  getEnrollmentTeam: (id: string) =>
    apiClient.get<EicTeamMember[]>(`${BASE}/enrollments/${id}/team`).then((r) => r.data),

  assignTherapist: (enrollmentId: string, data: {
    therapistId: string;
    therapistName: string;
    discipline: EicDiscipline;
  }) =>
    apiClient.post<EicTeamMember>(`${BASE}/enrollments/${enrollmentId}/team`, data).then((r) => r.data),

  removeTherapist: (enrollmentId: string, memberId: string) =>
    apiClient.delete(`${BASE}/enrollments/${enrollmentId}/team/${memberId}`),

  // ── Assessments ───────────────────────────────────────────────────────────────
  listAssessmentsAwaitingReview: () =>
    apiClient.get<EicAssessment[]>(`${BASE}/assessments`).then((r) => r.data),

  listAssessments: (enrollmentId: string) =>
    apiClient.get<EicAssessment[]>(`${BASE}/enrollments/${enrollmentId}/assessments`).then((r) => r.data),

  createAssessment: (enrollmentId: string, data: {
    discipline: EicDiscipline;
    therapistId: string;
    therapistName: string;
  }) =>
    apiClient.post<EicAssessment>(`${BASE}/enrollments/${enrollmentId}/assessments`, data).then((r) => r.data),

  /** Therapy reassessment — creates a new DRAFT linked to a FINALISED parent */
  reassessTherapyAssessment: (parentId: string, data: { therapistId: string; therapistName: string }) =>
    apiClient.post<EicAssessment>(`${BASE}/assessments/${parentId}/reassess`, data).then((r) => r.data),

  getAssessment: (id: string) =>
    apiClient.get<EicAssessment>(`${BASE}/assessments/${id}`).then((r) => r.data),

  updateAssessment: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<EicAssessment>(`${BASE}/assessments/${id}`, data).then((r) => r.data),

  submitAssessment: (id: string) =>
    apiClient.post<EicAssessment>(`${BASE}/assessments/${id}/submit`).then((r) => r.data),

  countersignAssessment: (id: string, notes?: string) =>
    apiClient.post<EicAssessment>(`${BASE}/assessments/${id}/countersign`, { notes }).then((r) => r.data),

  requestRevision: (id: string, notes: string) =>
    apiClient.post<EicAssessment>(`${BASE}/assessments/${id}/request-revision`, { notes }).then((r) => r.data),

  // ── Goals ─────────────────────────────────────────────────────────────────────
  listGoals: (enrollmentId: string, discipline?: EicDiscipline) =>
    apiClient.get<EicGoal[]>(`${BASE}/enrollments/${enrollmentId}/goals`, {
      params: discipline ? { discipline } : {},
    }).then((r) => r.data),

  createGoal: (enrollmentId: string, data: {
    assessmentId: string;
    discipline: EicDiscipline;
    goalType?: EicGoalType;
    goalText: string;
    targetDate?: string;
  }) =>
    apiClient.post<EicGoal>(`${BASE}/enrollments/${enrollmentId}/goals`, data).then((r) => r.data),

  updateGoal: (id: string, data: { goalText?: string; targetDate?: string }) =>
    apiClient.patch<EicGoal>(`${BASE}/goals/${id}`, data).then((r) => r.data),

  achieveGoal: (id: string, notes: string) =>
    apiClient.post<EicGoal>(`${BASE}/goals/${id}/achieve`, { notes }).then((r) => r.data),

  discontinueGoal: (id: string) =>
    apiClient.post<EicGoal>(`${BASE}/goals/${id}/discontinue`).then((r) => r.data),

  extendGoal: (id: string, data: { newTargetDate: string; remarks: string }) =>
    apiClient.post<EicGoal>(`${BASE}/goals/${id}/extend`, data).then((r) => r.data),

  // ── Sessions ──────────────────────────────────────────────────────────────────
  listSessions: (enrollmentId: string, discipline?: EicDiscipline, date?: string) =>
    apiClient.get<EicTherapySession[]>(`${BASE}/enrollments/${enrollmentId}/sessions`, {
      params: { ...(discipline && { discipline }), ...(date && { date }) },
    }).then((r) => r.data),

  createSession: (enrollmentId: string, data: {
    discipline: EicDiscipline;
    sessionDate: string;
    therapistId: string;
    therapistName: string;
    durationMinutes?: number;
    attendance?: string;
  }) =>
    apiClient.post<EicTherapySession>(`${BASE}/enrollments/${enrollmentId}/sessions`, data).then((r) => r.data),

  getSession: (id: string) =>
    apiClient.get<EicTherapySession>(`${BASE}/sessions/${id}`).then((r) => r.data),

  listSessionsByDate: (date: string, discipline?: EicDiscipline) =>
    apiClient.get<EicTherapySession[]>(`${BASE}/sessions`, {
      params: { date, ...(discipline && { discipline }) },
    }).then((r) => r.data),

  addSessionEntry: (sessionId: string, data: {
    goalId?: string;
    goalText: string;
    activity: string;
    childResponse: string;
    remarks?: string;
  }) =>
    apiClient.post<EicSessionEntry>(`${BASE}/sessions/${sessionId}/entries`, data).then((r) => r.data),

  updateSessionEntry: (sessionId: string, entryId: string, data: {
    goalId?: string;
    goalText?: string;
    activity?: string;
    childResponse?: string;
    remarks?: string;
  }) =>
    apiClient.patch<EicSessionEntry>(`${BASE}/sessions/${sessionId}/entries/${entryId}`, data).then((r) => r.data),

  deleteSessionEntry: (sessionId: string, entryId: string) =>
    apiClient.delete(`${BASE}/sessions/${sessionId}/entries/${entryId}`),

  submitSession: (id: string) =>
    apiClient.post<EicTherapySession>(`${BASE}/sessions/${id}/submit`).then((r) => r.data),

  // ── Progress Reports ──────────────────────────────────────────────────────────
  /**
   * Cross-enrollment work queue.
   * view: MY_SECTIONS | PENDING_SIGNATURE | ALL
   */
  getProgressReportWorkQueue: (
    view: 'MY_SECTIONS' | 'PENDING_SIGNATURE' | 'ALL',
    limit = 100,
    offset = 0,
  ) =>
    apiClient
      .get<EicWorkQueueItem[]>(`${BASE}/progress-reports`, { params: { view, limit, offset } })
      .then((r) => r.data),

  listProgressReports: (enrollmentId: string) =>
    apiClient.get<EicProgressReport[]>(`${BASE}/enrollments/${enrollmentId}/progress-reports`).then((r) => r.data),

  initiateProgressReport: (enrollmentId: string, data: {
    periodFrom: string;
    periodTo: string;
    disciplines: EicDiscipline[];
  }) =>
    apiClient.post<EicProgressReport>(`${BASE}/enrollments/${enrollmentId}/progress-reports`, data).then((r) => r.data),

  getProgressReport: (id: string) =>
    apiClient.get<EicProgressReport>(`${BASE}/progress-reports/${id}`).then((r) => r.data),

  updateProgressSection: (reportId: string, discipline: EicDiscipline, data: Record<string, unknown>) =>
    apiClient.patch(`${BASE}/progress-reports/${reportId}/sections/${discipline}`, data).then((r) => r.data),

  submitProgressSection: (reportId: string, discipline: EicDiscipline) =>
    apiClient.post(`${BASE}/progress-reports/${reportId}/sections/${discipline}/submit`).then((r) => r.data),

  signProgressReport: (id: string, data: { signatoryName: string; signatoryDesignation: string }) =>
    apiClient.post<EicProgressReport>(`${BASE}/progress-reports/${id}/sign`, data).then((r) => r.data),

  // ── Discharge ─────────────────────────────────────────────────────────────────
  initiateDischarge: (enrollmentId: string, data: {
    dischargeReason: string;
    dischargeDate: string;
    disciplines: EicDiscipline[];
  }) =>
    apiClient.post<EicDischargeSummary>(`${BASE}/enrollments/${enrollmentId}/discharge`, data).then((r) => r.data),

  getDischarge: (id: string) =>
    apiClient.get<EicDischargeSummary>(`${BASE}/discharge/${id}`).then((r) => r.data),

  getDischargeByEnrollment: (enrollmentId: string) =>
    apiClient.get<EicDischargeSummary>(`${BASE}/enrollments/${enrollmentId}/discharge`).then((r) => r.data),

  updateDischargeSummaryHeader: (dischargeId: string, data: {
    overallProgress?: string;
    homeProgramme?: string;
    followUpPlan?: string;
  }) =>
    apiClient.patch<EicDischargeSummary>(`${BASE}/discharge/${dischargeId}`, data).then((r) => r.data),

  updateDischargeSection: (dischargeId: string, discipline: EicDiscipline, data: Record<string, unknown>) =>
    apiClient.patch(`${BASE}/discharge/${dischargeId}/sections/${discipline}`, data).then((r) => r.data),

  submitDischargeSection: (dischargeId: string, discipline: EicDiscipline) =>
    apiClient.post(`${BASE}/discharge/${dischargeId}/sections/${discipline}/submit`).then((r) => r.data),

  signDischarge: (id: string, data: { signatoryName: string; signatoryDesignation: string }) =>
    apiClient.post<EicDischargeSummary>(`${BASE}/discharge/${id}/sign`, data).then((r) => r.data),

  // ── Preschool ─────────────────────────────────────────────────────────────────
  listPreschoolEnrollments: (q?: string) =>
    apiClient.get<EicPreschoolEnrollment[]>(`${BASE}/preschool`, { params: q ? { q } : {} }).then((r) => r.data),

  preschoolEnroll: (patientId: string, data: {
    admissionDate: string;
    classGroup?: string;
    teacherId?: string;
    teacherName?: string;
    notes?: string;
  }) =>
    apiClient.post(`${BASE}/preschool/${patientId}/enroll`, data).then((r) => r.data),

  getPreschoolEnrollment: (enrollId: string) =>
    apiClient.get<EicPreschoolEnrollment>(`${BASE}/preschool/${enrollId}`).then((r) => r.data),

  savePreschoolAssessment: (enrollId: string, data: Record<string, unknown>) =>
    apiClient.post<EicPreschoolAssessment>(`${BASE}/preschool/${enrollId}/assessment`, data).then((r) => r.data),

  listDailyReports: (enrollId: string, month?: string) =>
    apiClient.get<EicPreschoolDailyReport[]>(`${BASE}/preschool/${enrollId}/daily-reports`, {
      params: month ? { month } : {},
    }).then((r) => r.data),

  submitDailyReport: (enrollId: string, data: Record<string, unknown>) =>
    apiClient.post<EicPreschoolDailyReport>(`${BASE}/preschool/${enrollId}/daily-reports`, data).then((r) => r.data),

  startReassessment: (enrollId: string) =>
    apiClient.post<EicPreschoolAssessment>(`${BASE}/preschool/${enrollId}/reassessment`).then((r) => r.data),

  getAssessmentHistory: (enrollId: string) =>
    apiClient.get<EicPreschoolAssessment[]>(`${BASE}/preschool/${enrollId}/assessment-history`).then((r) => r.data),

  getBackdateLimit: () =>
    apiClient.get<{ key: string; value: number; unit: string }>(`${BASE}/preschool/settings/backdate-limit`).then((r) => r.data),

  setBackdateLimit: (days: number) =>
    apiClient.put<{ value: number }>(`${BASE}/preschool/settings/backdate-limit`, { days }).then((r) => r.data),
};
