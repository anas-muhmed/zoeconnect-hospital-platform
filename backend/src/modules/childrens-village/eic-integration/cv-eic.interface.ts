/**
 * Represents the normalized view of an EIC session as required by Children's Village.
 */
export interface UnifiedTherapySession {
  id: string;
  discipline: string;
  sessionDate: Date;
  therapistId: string;
  therapistName: string;
  durationMinutes: number | null;
  attendance: string;
  status: string;
}

/**
 * The standard interface that Children's Village relies on to fetch EIC data.
 * This completely decouples CV from EIC's internal entities.
 */
export interface ICvEicIntegrationService {
  /**
   * Checks if the EIC integration is enabled and the EIC module is available.
   * The UI can use this to hide/show therapy tabs.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Returns a summary of active therapy plans and team members for a student.
   */
  getTherapySummary(studentId: string): Promise<any | null>;

  /**
   * Retrieves upcoming EIC therapy sessions to merge into the CV Timetable.
   */
  getUpcomingSessions(studentId: string, startDate: Date, endDate: Date): Promise<UnifiedTherapySession[]>;

  /**
   * Returns EIC Goal details to display inside the CV IEP page.
   */
  getTherapyGoal(goalId: string): Promise<any | null>;
}
