import { Injectable, Inject, NotImplementedException, Logger } from '@nestjs/common';
import { CVStudentProvider, UnifiedStudent, ListStudentsParams, ListStudentsResult } from '../interfaces/cv-student.interface';
import { ORACLE_TRANSPORT } from '../../../platform/infrastructure/tokens';
import { IOracleTransport } from '../../../platform/infrastructure/oracle/oracle-transport.interface';

@Injectable()
export class OracleHisStudentProvider implements CVStudentProvider {
  private readonly logger = new Logger(OracleHisStudentProvider.name);

  constructor(
    @Inject(ORACLE_TRANSPORT) private readonly oracle: IOracleTransport,
  ) {}

  async searchStudents(query: string): Promise<UnifiedStudent[]> {
    // Basic search across MRN, names, mobile using OracleTransport
    const sql = `
      SELECT 
        UHID as mrn,
        PATIENT_FIRST_NAME as first_name,
        PATIENT_LAST_NAME as last_name,
        DOB as date_of_birth,
        GENDER as gender,
        MOBILE as mobile,
        FATHER_NAME as parent_name
      FROM PATIENT_MASTER 
      WHERE 
        UHID LIKE '%' || :query || '%'
        OR UPPER(PATIENT_FIRST_NAME) LIKE '%' || UPPER(:query) || '%'
        OR UPPER(PATIENT_LAST_NAME) LIKE '%' || UPPER(:query) || '%'
        OR MOBILE LIKE '%' || :query || '%'
      FETCH FIRST 50 ROWS ONLY
    `;
    const rows = await this.oracle.query<{
      mrn: string;
      first_name: string;
      last_name: string;
      date_of_birth: Date | null;
      gender: string | null;
      mobile: string | null;
      parent_name: string | null;
    }>(sql, { query }, { queryId: 'cv_student_search' });

    return rows.map((r: any) => ({
      id: r.mrn,
      registrationNumber: r.mrn,
      admissionNumber: null,
      studentCode: null,
      admissionStatus: 'ACTIVE', // Oracle students are inherently active in the hospital
      studentStatus: 'ACTIVE',
      firstName: r.first_name || '',
      lastName: r.last_name || '',
      dateOfBirth: r.date_of_birth,
      gender: r.gender,
      parentName: r.parent_name,
      parentContact: r.mobile,
      source: 'ORACLE_HIS',
    }));
  }

  /**
   * There's no "browse every patient" query contract defined for HIS mode
   * (see the query-only contracts wired up in vendor-portal's HIS Schema
   * Configuration screen -- lookup-by-MRN and search, never a full-table
   * scan of PATIENT_MASTER) -- and dumping an entire hospital's patient
   * table as a "student directory" isn't a real use case anyway. A query is
   * required here; falls through to the same search this provider already
   * supports rather than duplicating that SQL.
   */
  async listStudents(params: ListStudentsParams): Promise<ListStudentsResult> {
    if (!params.query || params.query.trim().length === 0) {
      throw new NotImplementedException(
        'Browsing the full student directory is not supported when using the Oracle HIS student provider -- search by name, MRN, or mobile instead.',
      );
    }
    const items = await this.searchStudents(params.query);
    return { items, total: items.length };
  }

  async getStudentById(id: string): Promise<UnifiedStudent | null> {
    const sql = `
      SELECT 
        UHID as mrn,
        PATIENT_FIRST_NAME as first_name,
        PATIENT_LAST_NAME as last_name,
        DOB as date_of_birth,
        GENDER as gender,
        MOBILE as mobile,
        FATHER_NAME as parent_name
      FROM PATIENT_MASTER 
      WHERE UHID = :id
    `;
    const row = await this.oracle.queryOne<{
      mrn: string;
      first_name: string;
      last_name: string;
      date_of_birth: Date | null;
      gender: string | null;
      mobile: string | null;
      parent_name: string | null;
    }>(sql, { id }, { queryId: 'cv_student_get_by_id' });

    if (!row) {
      return null;
    }

    return {
      id: row.mrn,
      registrationNumber: row.mrn,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      parentName: row.parent_name,
      parentContact: row.mobile,
      source: 'ORACLE_HIS',
    };
  }

  async createStudent(data: Partial<UnifiedStudent>): Promise<UnifiedStudent> {
    throw new NotImplementedException(
      'Student admissions cannot be created directly when using the Oracle HIS student provider. Admissions are managed exclusively by the external HIS.',
    );
  }

  async updateStudent(id: string, data: Partial<UnifiedStudent>): Promise<UnifiedStudent> {
    throw new NotImplementedException(
      'Student records cannot be updated directly when using the Oracle HIS student provider. Updates are managed exclusively by the external HIS.',
    );
  }
}
