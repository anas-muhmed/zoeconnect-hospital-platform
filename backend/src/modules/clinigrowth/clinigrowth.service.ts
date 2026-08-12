import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { OraclePoolManager } from '../his/oracle-pool.service';

interface VitalsRow {
  FIRSTNAME?: string; firstname?: string;
  MIDDLENAME?: string; middlename?: string;
  LASTNAME?: string; lastname?: string;
  GENDER?: string; gender?: string;
  DOB?: string; dob?: string;
  AGE_AT_ENTRY?: number | string; age_at_entry?: number | string;
  PARAMETER_VALUE?: string; parameter_value?: string;
  CURRENT_VALUE?: number | string; current_value?: number | string;
  ENTERED_DATETIME?: string; entered_datetime?: string;
}

export interface GrowthChartPatient {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  gender: string | null;
  dob: string | null;
}

export interface GrowthChartVisit {
  enteredDatetime: string;
  ageAtEntry: number | string | null;
  height: number | string | null;
  weight: number | string | null;
  headCircumference: number | string | null;
}

/**
 * CliniGrowth integration (delivery phase).
 *
 * Ports `cinigrowth/patientVitals.routes.js`'s single endpoint — the
 * module's entire backend is this one read-only growth-chart query
 * against the hospital's external Oracle HIS (height/weight/head
 * circumference over time for a patient, by MRN).
 *
 * Architecture note: the source imported its Oracle connection pool
 * (`drug-indenting/db/pool.js`) and auth middleware from the Drug
 * Indenting module purely because both happened to run in the same
 * Express process and Drug Indenting already had Oracle wired up — not a
 * real domain dependency between the two modules (CliniGrowth's growth
 * charts have no business relationship to drug requests). ZoeConnect
 * already has this exact shared capability natively: `OraclePoolManager`
 * (tenant-routed HIS connection pooling, see `HisConfigModule`) and
 * `JwtAuthGuard`. This service depends on that shared platform
 * infrastructure only — never on the Drug Indenting module.
 */
@Injectable()
export class ClinigrowthService {
  constructor(private readonly oracle: OraclePoolManager) {}

  async getPatientVitals(mrno: string): Promise<{ patient: GrowthChartPatient; visits: GrowthChartVisit[] }> {
    if (!this.oracle.isAvailable) {
      throw new ServiceUnavailableException('HIS integration is currently unavailable');
    }

    const sql = `
      SELECT
        p.firstname,
        p.middlename,
        p.lastname,
        CASE p.genderid
          WHEN 1 THEN 'male'
          WHEN 2 THEN 'female'
          ELSE 'unknown'
        END AS gender,
        p.dob,
        ROUND(MONTHS_BETWEEN(vs.entered_datetime, p.dob) / 12, 1) AS age_at_entry,
        vs.parameter_value,
        vs.current_value,
        vs.entered_datetime
      FROM patient p
      LEFT JOIN vitalsign vs
        ON p.patient_id = vs.patient_id
        AND UPPER(TRIM(vs.parameter_value)) IN ('HEIGHT', 'WEIGHT', 'HEAD CIRCUMFERENCE')
        AND vs.current_value IS NOT NULL
      WHERE p.mrno = :mrno
      ORDER BY
        vs.entered_datetime ASC,
        vs.parameter_value
    `;

    const rows = await this.oracle.query<VitalsRow>(sql, { mrno });
    if (!rows || rows.length === 0) {
      throw new NotFoundException(`No patient found for mrno ${mrno}`);
    }

    // Oracle returns column aliases in UPPERCASE unless double-quoted — normalize, same pattern as HisModule's PatientService.
    const norm = (r: VitalsRow) => ({
      firstname: r.FIRSTNAME ?? r.firstname ?? null,
      middlename: r.MIDDLENAME ?? r.middlename ?? null,
      lastname: r.LASTNAME ?? r.lastname ?? null,
      gender: r.GENDER ?? r.gender ?? null,
      dob: r.DOB ?? r.dob ?? null,
      ageAtEntry: r.AGE_AT_ENTRY ?? r.age_at_entry ?? null,
      parameterValue: r.PARAMETER_VALUE ?? r.parameter_value ?? null,
      currentValue: r.CURRENT_VALUE ?? r.current_value ?? null,
      enteredDatetime: r.ENTERED_DATETIME ?? r.entered_datetime ?? null,
    });

    const normalized = rows.map(norm);
    const first = normalized[0];
    const patient: GrowthChartPatient = {
      firstName: first.firstname,
      middleName: first.middlename,
      lastName: first.lastname,
      gender: first.gender,
      dob: first.dob,
    };

    const visitsByTimestamp = new Map<string, GrowthChartVisit>();
    for (const row of normalized) {
      if (!row.enteredDatetime || !row.parameterValue) continue;
      const key = row.enteredDatetime;
      if (!visitsByTimestamp.has(key)) {
        visitsByTimestamp.set(key, {
          enteredDatetime: row.enteredDatetime,
          ageAtEntry: row.ageAtEntry,
          height: null,
          weight: null,
          headCircumference: null,
        });
      }
      const visit = visitsByTimestamp.get(key)!;
      const param = row.parameterValue.trim().toUpperCase();
      if (param === 'HEIGHT') visit.height = row.currentValue;
      else if (param === 'WEIGHT') visit.weight = row.currentValue;
      else if (param === 'HEAD CIRCUMFERENCE') visit.headCircumference = row.currentValue;
    }

    const visits = Array.from(visitsByTimestamp.values())
      .sort((a, b) => new Date(a.enteredDatetime).getTime() - new Date(b.enteredDatetime).getTime());

    return { patient, visits };
  }
}
