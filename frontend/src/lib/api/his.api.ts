import { apiClient } from './client';

export interface HisSearchResult {
  mrn: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  mobile: string | null;
  registrationDate: string;
}

export interface HisPatient {
  mrn: string;
  salutation: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  gender: 'M' | 'F' | 'O';
  dateOfBirth: string;
  age: number | null;
  bloodGroup: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  aadhaarLast4: string | null;
  registrationDate: string;
  isActive: boolean;
}


export interface HisBill {
  billId: string;
  mrn: string;
  patientName: string;
  visitId: string | null;
  billDate: string;
  billType: 'OPD' | 'IPD' | 'EMERGENCY' | 'DAY_CARE';
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  discountAmount: number;
  status: 'PAID' | 'PARTIAL' | 'PENDING' | 'CANCELLED';
  doctorCode: string | null;
  doctorName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
}

export interface HisVisit {
  visitId: string;
  mrn: string;
  visitDate: string;
  visitType: 'OPD' | 'IPD' | 'EMERGENCY' | 'DAY_CARE';
  admissionDate: string | null;
  dischargeDate: string | null;
  doctorCode: string;
  doctorName: string;
  departmentCode: string;
  departmentName: string;
  ward: string | null;
  bed: string | null;
  diagnosis: string | null;
  status: 'ACTIVE' | 'DISCHARGED' | 'COMPLETED' | 'CANCELLED';
}

export interface HisDoctor {
  doctorCode: string;
  doctorName: string;
  specialization: string;
  departmentCode: string;
  departmentName: string;
  qualification: string | null;
  isActive: boolean;
}

export interface HisDepartment {
  departmentCode: string;
  departmentName: string;
  shortCode: string;
  type: string | null;
  isActive: boolean;
}

export const hisApi = {
  status: () =>
    apiClient.get<{ available: boolean }>('/his/status').then((r) => r.data),

  getEmployees: () =>
    apiClient.get('/his/reference/employees').then(r => r.data),

  searchPatients: (q: string, limit = 20) =>
    apiClient
      .get<HisSearchResult[]>('/his/patients/search', { params: { q, limit } })
      .then((r) => r.data),

  getPatient: (mrn: string) =>
    apiClient.get<HisPatient>(`/his/patients/${mrn}`).then((r) => r.data),

  getPatientBills: (mrn: string, limit = 50) =>
    apiClient
      .get<HisBill[]>(`/his/patients/${mrn}/bills`, { params: { limit } })
      .then((r) => r.data),

  getBill: (billId: string) =>
    apiClient.get<HisBill & { items: unknown[] }>(`/his/bills/${billId}`).then((r) => r.data),

  getPatientVisits: (mrn: string, opts: { limit?: number; type?: string } = {}) =>
    apiClient
      .get<HisVisit[]>(`/his/patients/${mrn}/visits`, { params: opts })
      .then((r) => r.data),

  getDepartments: () =>
    apiClient.get<HisDepartment[]>('/his/reference/departments').then((r) => r.data),

  getDoctors: (deptCode?: string) =>
    apiClient
      .get<HisDoctor[]>('/his/reference/doctors', { params: { deptCode } })
      .then((r) => r.data),

  // ── Sync management ────────────────────────────────────────────────────────
  getSyncStatus: () =>
    apiClient
      .get<{ cursor: string; key: string }>('/his/sync/status')
      .then((r) => r.data),

  /** fromDate defaults to '2000-01-01' on the server — fetches ALL historical data */
  triggerBackfill: (fromDate?: string) =>
    apiClient
      .post<{
        ok: boolean;
        cursorReset: string;
        message: string;
        diagnostics: {
          oracleConnected: boolean;
          configKeysLoaded: number;
          syncSqlConfigured: boolean;
          hint: string | null;
        };
      }>(
        '/his/sync/backfill',
        null,
        fromDate ? { params: { fromDate } } : {},
      )
      .then((r) => r.data),

  diagnose: () =>
    apiClient
      .get<{
        oracleConnected: boolean;
        configKeysLoaded: number;
        syncSqlConfigured: boolean;
        hint: string | null;
      }>('/his/sync/diagnose')
      .then((r) => r.data),
};
