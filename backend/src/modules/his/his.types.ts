/**
 * HIS Integration Type Definitions
 *
 * These interfaces map to the Oracle HIS schema (read-only).
 * Column names are normalised from HIS_FIELD_NAMES → camelCase.
 * Adjust the SQL queries in the service files if the HIS schema differs.
 */

export interface HisPatient {
  mrn: string;              // PAT_MASTER.UHID / MRN
  salutation: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  gender: 'M' | 'F' | 'O';
  dateOfBirth: string;      // ISO date
  age: number | null;
  bloodGroup: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  aadhaarLast4: string | null;  // masked — only last 4 digits
  registrationDate: string;     // ISO date
  isActive: boolean;
}

export interface HisBillItem {
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  departmentCode: string;
  departmentName: string;
}

export interface HisBill {
  billId: string;           // BILL_MASTER.BILL_NO
  mrn: string;
  patientName: string;
  visitId: string | null;
  billDate: string;         // ISO datetime
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
  items: HisBillItem[];
}

export interface HisVisit {
  visitId: string;
  mrn: string;
  visitDate: string;        // ISO datetime
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

export interface HisSearchResult {
  mrn: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  mobile: string | null;
  registrationDate: string;
}
