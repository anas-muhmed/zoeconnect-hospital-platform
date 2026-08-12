export interface UnifiedStudent {
  id: string; // Internal UUID or Oracle MRN/UHID
  registrationNumber: string | null;
  admissionNumber?: string | null;
  studentCode?: string | null;
  admissionStatus?: string;
  studentStatus?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  gender: string | null;
  parentName: string | null;
  parentContact: string | null;
  source: 'INTERNAL' | 'ORACLE_HIS';
}

export interface ListStudentsParams {
  /** Free-text search across name/registration number, same fields as searchStudents(). Optional -- omitted means "browse all". */
  query?: string;
  /** Filter to one admissionStatus ('PENDING' | 'ENROLLED' | 'REJECTED'). Omitted means "all statuses". */
  admissionStatus?: string;
  page?: number;
  limit?: number;
}

export interface ListStudentsResult {
  items: UnifiedStudent[];
  total: number;
}

export abstract class CVStudentProvider {
  abstract searchStudents(query: string): Promise<UnifiedStudent[]>;
  /**
   * Browse-by-default listing (2026-08-03, requested to replace the
   * search-only Student Directory UX): newest-first, filterable by
   * admissionStatus, paginated. Distinct from searchStudents() rather than
   * folding query-optional into it, since the two have different contracts
   * -- searchStudents() is unpaginated/unordered/capped at 50 by design,
   * this is a proper paginated list.
   */
  abstract listStudents(params: ListStudentsParams): Promise<ListStudentsResult>;
  abstract getStudentById(id: string): Promise<UnifiedStudent | null>;
  abstract createStudent(data: Partial<UnifiedStudent>): Promise<UnifiedStudent>;
  abstract updateStudent(id: string, data: Partial<UnifiedStudent>): Promise<UnifiedStudent>;
}
