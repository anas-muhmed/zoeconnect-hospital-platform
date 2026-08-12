'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Collapse from '@mui/material/Collapse';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';

import TuneIcon from '@mui/icons-material/Tune';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CheckIcon from '@mui/icons-material/Check';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EditNoteIcon from '@mui/icons-material/EditNote';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SyncIcon from '@mui/icons-material/Sync';
import StorageIcon from '@mui/icons-material/Storage';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';

import { vendorApi } from '@/lib/api/vendor.api';
import type { HisConfigTemplate } from '@/lib/api/vendor.api';
import { join } from 'path';

// -- DB_CONNECTION keys (in order for the form) --------------------------------
const DB_FIELDS = [
  { key: 'db.host', label: 'Oracle DB Host', placeholder: '192.168.1.10 or oracle.hospital.local', type: 'text', hint: 'Hostname or IP of the Oracle server' },
  { key: 'db.port', label: 'Oracle DB Port', placeholder: '1521', type: 'number', hint: 'Default Oracle listener port is 1521' },
  { key: 'db.service', label: 'Service Name / SID', placeholder: 'HISDB', type: 'text', hint: 'Oracle service name (preferred) or SID' },
  { key: 'db.user', label: 'DB Username', placeholder: 'HDSP_READONLY', type: 'text', hint: 'Oracle user with SELECT access to HIS tables' },
  { key: 'db.password', label: 'DB Password', placeholder: '', type: 'password', hint: 'Stored encrypted. Leave blank to keep existing password on ZoeConnect.' },
  { key: 'db.mode', label: 'Connection Mode', placeholder: '', type: 'select', hint: 'thin = pure JS driver. thick = requires Oracle Instant Client on the ZoeConnect server.' },
  { key: 'db.pool.min', label: 'Pool Min Connections', placeholder: '2', type: 'number', hint: 'Minimum connections kept alive in the pool' },
  { key: 'db.pool.max', label: 'Pool Max Connections', placeholder: '20', type: 'number', hint: 'Maximum concurrent Oracle connections' },
] as const;

// -- Query contract types ---------------------------------------------------

interface ContractNote {
  tag: 'TYPE' | 'FORMAT' | 'BIND' | 'RULE';
  text: string;
}

const NOTE_STYLE: Record<ContractNote['tag'], { bg: string; color: string }> = {
  TYPE: { bg: '#fff3e0', color: '#e65100' },   // orange  — data type requirement
  FORMAT: { bg: '#f3e5f5', color: '#7b1fa2' },   // purple  — expected string/date format
  BIND: { bg: '#e3f2fd', color: '#1565c0' },   // blue    — bind parameter semantics
  RULE: { bg: '#e8f5e9', color: '#2e7d32' },   // green   — business rule / constraint
};

interface QueryContract {
  key: string;
  title: string;
  service: string;
  description: string;
  binds: string[];
  required: string[];
  notes: ContractNote[];
  templateSql: string;
}

const CONTRACTS: QueryContract[] = [
  {
    key: 'sql.patient.getByMrn',
    title: 'Patient - Lookup by MRN',
    service: 'PatientService.getByMrn()',
    description: 'Returns one patient record. Called on every patient lookup in ZoeConnect.',
    binds: [':mrn'],
    required: ['"mrn"', '"salutation"', '"firstName"', '"middleName"', '"lastName"', '"fullName"', '"gender"', '"dateOfBirth"', '"age"', '"bloodGroup"', '"mobile"', '"email"', '"address"', '"city"', '"state"', '"pinCode"', '"aadhaarLast4"', '"registrationDate"', '"isActiveFlag"'],
    notes: [
      { tag: 'TYPE', text: '"isActiveFlag" must be integer 1 (active) or 0 (inactive) — not a string or boolean.' },
      { tag: 'TYPE', text: '"age" must be a number. Use FLOOR(MONTHS_BETWEEN(SYSDATE, dob) / 12). May be NULL.' },
      { tag: 'FORMAT', text: '"dateOfBirth" and "registrationDate" — use TO_CHAR(col, \'YYYY-MM-DD\').' },
      { tag: 'RULE', text: '"aadhaarLast4" must be the last 4 digits only — use SUBSTR(aadhaar_col, -4).' },
      { tag: 'RULE', text: '"fullName" must include salutation prefix — TRIM(salutation || \' \' || first || \' \' || last).' },
    ],
    templateSql: [
      'SELECT',
      '  p.UHID                                         AS "mrn",',
      '  p.SALUTATION                                   AS "salutation",',
      '  p.FIRST_NAME                                   AS "firstName",',
      '  p.MIDDLE_NAME                                  AS "middleName",',
      '  p.LAST_NAME                                    AS "lastName",',
      "  TRIM(p.SALUTATION || ' ' || p.FIRST_NAME",
      "       || ' ' || NVL(p.MIDDLE_NAME,'') || ' ' || p.LAST_NAME) AS \"fullName\",",
      '  p.GENDER                                       AS "gender",',
      "  TO_CHAR(p.DOB,'YYYY-MM-DD')                   AS \"dateOfBirth\",",
      '  FLOOR(MONTHS_BETWEEN(SYSDATE,p.DOB)/12)        AS "age",',
      '  p.BLOOD_GROUP                                  AS "bloodGroup",',
      '  p.MOBILE_NO                                    AS "mobile",',
      '  p.EMAIL_ID                                     AS "email",',
      '  p.ADDRESS_LINE1                                AS "address",',
      '  p.CITY                                         AS "city",',
      '  p.STATE                                        AS "state",',
      '  p.PIN_CODE                                     AS "pinCode",',
      '  SUBSTR(p.AADHAAR_NO,-4)                        AS "aadhaarLast4",',
      "  TO_CHAR(p.REG_DATE,'YYYY-MM-DD')              AS \"registrationDate\",",
      "  CASE WHEN p.STATUS = 'A' THEN 1 ELSE 0 END    AS \"isActiveFlag\"",
      'FROM PAT_MASTER p',
      'WHERE p.UHID = :mrn',
    ].join('\n'),
  },
  {
    key: 'sql.patient.search',
    title: 'Patient - Search',
    service: 'PatientService.search()',
    description: 'Search by MRN, mobile number, or full name. Returns up to :lim rows.',
    binds: [':term', ':like', ':lim'],
    required: ['"mrn"', '"fullName"', '"gender"', '"dateOfBirth"', '"mobile"', '"registrationDate"'],
    notes: [
      { tag: 'BIND', text: ':term — the raw search value, already UPPER()\'d by ZoeConnect. Use for exact MRN or mobile match.' },
      { tag: 'BIND', text: ':like — the wildcard form: %TERM%. Use with LIKE for name matching.' },
      { tag: 'BIND', text: ':lim — max rows to return (integer). Must include FETCH FIRST :lim ROWS ONLY.' },
      { tag: 'FORMAT', text: '"dateOfBirth" — use TO_CHAR(col, \'YYYY-MM-DD\').' },
      { tag: 'RULE', text: 'ORDER BY registration date descending so the most recent patients appear first.' },
    ],
    templateSql: [
      'SELECT',
      '  p.UHID                                              AS "mrn",',
      "  TRIM(p.FIRST_NAME || ' ' || NVL(p.MIDDLE_NAME,'')",
      '       || \' \' || p.LAST_NAME)                        AS "fullName",',
      '  p.GENDER                                            AS "gender",',
      "  TO_CHAR(p.DOB,'YYYY-MM-DD')                        AS \"dateOfBirth\",",
      '  p.MOBILE_NO                                         AS "mobile",',
      "  TO_CHAR(p.REG_DATE,'YYYY-MM-DD')                   AS \"registrationDate\"",
      'FROM PAT_MASTER p',
      'WHERE p.UHID = :term',
      '   OR UPPER(p.MOBILE_NO) = :term',
      "   OR UPPER(TRIM(p.FIRST_NAME || ' ' || NVL(p.MIDDLE_NAME,'')",
      '            || \' \' || p.LAST_NAME)) LIKE :like',
      'ORDER BY p.REG_DATE DESC',
      'FETCH FIRST :lim ROWS ONLY',
    ].join('\n'),
  },
  {
    key: 'sql.billing.getBillsByMrn',
    title: 'Billing - Bills by MRN',
    service: 'BillingService.getBillsByMrn()',
    description: 'Returns paginated bill summaries for a patient. No line items.',
    binds: [':mrn', ':lim'],
    required: ['"billId"', '"mrn"', '"patientName"', '"visitId"', '"billDate"', '"billType"', '"totalAmount"', '"paidAmount"', '"balanceAmount"', '"discountAmount"', '"status"', '"doctorCode"', '"doctorName"', '"departmentCode"', '"departmentName"'],
    notes: [
      { tag: 'FORMAT', text: '"billDate" — use TO_CHAR(col, \'YYYY-MM-DD"T"HH24:MI:SS\') for full ISO timestamp.' },
      { tag: 'TYPE', text: '"totalAmount", "paidAmount", "balanceAmount", "discountAmount" — numeric values, not strings.' },
      { tag: 'RULE', text: '"doctorName" and "departmentName" — JOIN to master tables if stored as FK codes.' },
      { tag: 'BIND', text: ':lim — max rows. Include FETCH FIRST :lim ROWS ONLY at the end.' },
    ],
    templateSql: [
      'SELECT',
      '  b.BILL_NO                                           AS "billId",',
      '  b.UHID                                              AS "mrn",',
      '  b.PATIENT_NAME                                      AS "patientName",',
      '  b.VISIT_ID                                          AS "visitId",',
      "  TO_CHAR(b.BILL_DATE,'YYYY-MM-DD\"T\"HH24:MI:SS')    AS \"billDate\",",
      '  b.BILL_TYPE                                         AS "billType",',
      '  b.TOTAL_AMT                                         AS "totalAmount",',
      '  b.PAID_AMT                                          AS "paidAmount",',
      '  b.BALANCE_AMT                                       AS "balanceAmount",',
      '  b.DISCOUNT_AMT                                      AS "discountAmount",',
      '  b.BILL_STATUS                                       AS "status",',
      '  b.DOCTOR_CODE                                       AS "doctorCode",',
      '  b.DOCTOR_NAME                                       AS "doctorName",',
      '  b.DEPT_CODE                                         AS "departmentCode",',
      '  b.DEPT_NAME                                         AS "departmentName"',
      'FROM BILL_MASTER b',
      'WHERE b.UHID = :mrn',
      'ORDER BY b.BILL_DATE DESC',
      'FETCH FIRST :lim ROWS ONLY',
    ].join('\n'),
  },
  {
    key: 'sql.billing.sync',
    title: 'Billing - Real-time Sync',
    service: 'BillingService.getNewFinalizedBills()',
    description: 'Polled every 10 s by HisSyncScheduler. Returns finalized bills updated after :since.',
    binds: [':since', ':lim'],
    required: ['"billId"', '"mrn"', '"patientName"', '"visitId"', '"billDate"', '"billType"', '"totalAmount"', '"paidAmount"', '"balanceAmount"', '"discountAmount"', '"status"', '"doctorCode"', '"doctorName"', '"departmentCode"', '"departmentName"'],
    notes: [
      { tag: 'BIND', text: ':since — ISO timestamp string of the last processed bill\'s updated_at. ZoeConnect advances this cursor after each batch.' },
      { tag: 'RULE', text: 'Filter to FINALISED status only. Explicitly exclude CANCELLED and REVERSED bills.' },
      { tag: 'RULE', text: 'ORDER BY updated_at ASC so the cursor advances in chronological order.' },
      { tag: 'RULE', text: 'Compare updated_at > :since (strict greater-than, not >=) to avoid reprocessing the last seen bill.' },
    ],
    templateSql: [
      '-- Polled every 10 s. :since = ISO timestamp of last processed bill.',
      'SELECT',
      '  b.BILL_NO                                           AS "billId",',
      '  b.UHID                                              AS "mrn",',
      '  b.PATIENT_NAME                                      AS "patientName",',
      '  b.VISIT_ID                                          AS "visitId",',
      "  TO_CHAR(b.BILL_DATE,'YYYY-MM-DD\"T\"HH24:MI:SS')    AS \"billDate\",",
      '  b.BILL_TYPE                                         AS "billType",',
      '  b.TOTAL_AMT                                         AS "totalAmount",',
      '  b.PAID_AMT                                          AS "paidAmount",',
      '  b.BALANCE_AMT                                       AS "balanceAmount",',
      '  b.DISCOUNT_AMT                                      AS "discountAmount",',
      '  b.BILL_STATUS                                       AS "status",',
      '  b.DOCTOR_CODE                                       AS "doctorCode",',
      '  b.DOCTOR_NAME                                       AS "doctorName",',
      '  b.DEPT_CODE                                         AS "departmentCode",',
      '  b.DEPT_NAME                                         AS "departmentName"',
      'FROM BILL_MASTER b',
      "WHERE b.BILL_STATUS  = 'FINALISED'",
      "  AND b.BILL_STATUS NOT IN ('CANCELLED','REVERSED')",
      '  AND b.UPDATED_AT  > :since',
      'ORDER BY b.UPDATED_AT ASC',
      'FETCH FIRST :lim ROWS ONLY',
    ].join('\n'),
  },
  {
    key: 'sql.billing.getLineItems',
    title: 'Billing - Line Items',
    service: 'BillingService.getBillById() sub-query',
    description: 'Returns all line items for a single bill. Always sorted by serial number.',
    binds: [':billId'],
    required: ['"itemCode"', '"itemName"', '"quantity"', '"unitPrice"', '"amount"', '"departmentCode"', '"departmentName"'],
    notes: [
      { tag: 'TYPE', text: '"quantity", "unitPrice", "amount" — numeric values (not strings).' },
      { tag: 'RULE', text: '"departmentName" — usually denormalized in line items table. JOIN if stored as FK.' },
      { tag: 'RULE', text: 'ORDER BY serial number column ascending so items appear in billing order.' },
    ],
    templateSql: [
      'SELECT',
      '  bi.ITEM_CODE   AS "itemCode",',
      '  bi.ITEM_NAME   AS "itemName",',
      '  bi.QUANTITY    AS "quantity",',
      '  bi.UNIT_PRICE  AS "unitPrice",',
      '  bi.AMOUNT      AS "amount",',
      '  bi.DEPT_CODE   AS "departmentCode",',
      '  bi.DEPT_NAME   AS "departmentName"',
      'FROM BILL_ITEMS bi',
      'WHERE bi.BILL_NO = :billId',
      'ORDER BY bi.SL_NO',
    ].join('\n'),
  },
  {
    key: 'sql.visit.getByMrn',
    title: 'Visit - Visits by MRN',
    service: 'VisitService.getVisitsByMrn()',
    description: 'Returns paginated visit/admission records for a patient.',
    binds: [':mrn', ':lim'],
    required: ['"visitId"', '"mrn"', '"visitDate"', '"visitType"', '"admissionDate"', '"dischargeDate"', '"doctorCode"', '"doctorName"', '"departmentCode"', '"departmentName"', '"ward"', '"bed"', '"diagnosis"', '"status"'],
    notes: [
      { tag: 'FORMAT', text: '"visitDate", "admissionDate", "dischargeDate" — use TO_CHAR(col, \'YYYY-MM-DD"T"HH24:MI:SS\').' },
      { tag: 'TYPE', text: '"admissionDate", "dischargeDate", "ward", "bed" — may be NULL for OPD visits. That is expected.' },
      { tag: 'RULE', text: '"visitType" — return the raw value from your HIS (e.g. OPD, IPD). ZoeConnect displays it as-is.' },
      { tag: 'BIND', text: ':lim — max rows. Include FETCH FIRST :lim ROWS ONLY.' },
    ],
    templateSql: [
      'SELECT',
      '  v.VISIT_ID                                          AS "visitId",',
      '  v.UHID                                              AS "mrn",',
      "  TO_CHAR(v.VISIT_DATE,'YYYY-MM-DD\"T\"HH24:MI:SS')   AS \"visitDate\",",
      '  v.VISIT_TYPE                                        AS "visitType",',
      "  TO_CHAR(v.ADMISSION_DATE,'YYYY-MM-DD\"T\"HH24:MI:SS\") AS \"admissionDate\",",
      "  TO_CHAR(v.DISCHARGE_DATE,'YYYY-MM-DD\"T\"HH24:MI:SS\") AS \"dischargeDate\",",
      '  v.DOCTOR_CODE                                       AS "doctorCode",',
      '  v.DOCTOR_NAME                                       AS "doctorName",',
      '  v.DEPT_CODE                                         AS "departmentCode",',
      '  v.DEPT_NAME                                         AS "departmentName",',
      '  v.WARD_NAME                                         AS "ward",',
      '  v.BED_NO                                            AS "bed",',
      '  v.DIAGNOSIS                                         AS "diagnosis",',
      '  v.VISIT_STATUS                                      AS "status"',
      'FROM VISIT_MASTER v',
      'WHERE v.UHID = :mrn',
      'ORDER BY v.VISIT_DATE DESC',
      'FETCH FIRST :lim ROWS ONLY',
    ].join('\n'),
  },
  {
    key: 'sql.reference.departments',
    title: 'Reference - Departments',
    service: 'ReferenceService.getDepartments()',
    description: 'Returns all active departments. Cached for 1 hour in Redis.',
    binds: [],
    required: ['"departmentCode"', '"departmentName"', '"shortCode"', '"type"', '"isActiveFlag"'],
    notes: [
      { tag: 'TYPE', text: '"isActiveFlag" — integer 1 (active) or 0 (inactive).' },
      { tag: 'TYPE', text: '"type" — department category string (e.g. CLINICAL, ADMIN). May be NULL.' },
      { tag: 'RULE', text: 'Filter to active departments only using your status column. Results are cached for 1 hour.' },
      { tag: 'RULE', text: 'Cache clears automatically when you push an updated HIS config to the hospital.' },
    ],
    templateSql: [
      'SELECT',
      '  d.DEPT_CODE                                         AS "departmentCode",',
      '  d.DEPT_NAME                                         AS "departmentName",',
      '  d.SHORT_CODE                                        AS "shortCode",',
      '  d.DEPT_TYPE                                         AS "type",',
      "  CASE WHEN d.STATUS = 'A' THEN 1 ELSE 0 END         AS \"isActiveFlag\"",
      'FROM DEPARTMENT_MASTER d',
      "WHERE d.STATUS = 'A'",
      'ORDER BY d.DEPT_NAME',
    ].join('\n'),
  },
  {
    key: 'sql.reference.doctors',
    title: 'Reference - Doctors',
    service: 'ReferenceService.getDoctors()',
    description: 'Returns all active doctors, optionally filtered by department. Cached 1 hour.',
    binds: [':deptCode (optional)'],
    required: ['"doctorCode"', '"doctorName"', '"specialization"', '"departmentCode"', '"departmentName"', '"qualification"', '"isActiveFlag"'],
    notes: [
      { tag: 'TYPE', text: '"isActiveFlag" — integer 1 (active) or 0 (inactive).' },
      { tag: 'TYPE', text: '"specialization" and "qualification" may be NULL if not stored in your HIS.' },
      { tag: 'BIND', text: ':deptCode is optional. ZoeConnect passes it only when filtering by department. Omit the AND clause if you don\'t need filtering.' },
      { tag: 'RULE', text: 'Results are cached per department code for 1 hour. Cache clears on config push.' },
    ],
    templateSql: [
      'SELECT',
      '  doc.EMPNO                                            AS "doctorCode",',
      '  doc.EMPLOYEE_NAME                                    AS "doctorName",',
      '  doc.SPECIALITY                                       AS "specialization",',
      '  d.department_code                                    AS "departmentCode",',
      '  d.department_name                                    AS "departmentName",',
      '  doc.QUALIFICATION                                    AS "qualification",',
      "  CASE WHEN doc.emp_status = '75' THEN 1 ELSE 0 END    AS \"isActiveFlag\"",
      'FROM employee doc',
      'inner join employeecategorymap ecm on ecm.employeeid=doc.employee_id',
      'left join hisdepartment d on d.department_id=doc.department_id',
      "WHERE doc.emp_STATUS = '75' and ecm.groupid=54",
      'ORDER BY doc.EMpLOYEE_NAME',
    ].join('\n'),
  },
];


// -- Attendance runtime config fields --------------------------------------
interface AttendanceField {
  key: string;
  label: string;
  defaultValue: string;
  hint: string;
  requiresRestart?: boolean;
  type?: 'text' | 'boolean' | 'number' | 'cron';
}

const ATTENDANCE_GROUPS: { label: string; fields: AttendanceField[] }[] = [
  {
    label: 'Core Realtime Polling',
    fields: [
      { key: 'attendance.runtime.enabled', label: 'Realtime Polling Enabled', defaultValue: 'false', type: 'boolean', hint: 'Master switch for Oracle ATTLOGS realtime polling. Set true to activate.' },
      { key: 'attendance.runtime.pollIntervalMs', label: 'Poll Interval (ms)', defaultValue: '1500', type: 'number', hint: 'How often the listener dequeues from Bull. Default 1500 ms.' },
      { key: 'attendance.runtime.pollBatchSize', label: 'Poll Batch Size', defaultValue: '500', type: 'number', hint: 'Max punches fetched per polling cycle. Default 500.' },
      { key: 'attendance.runtime.initialCursor', label: 'Initial Cursor (ISO-8601)', defaultValue: '', type: 'text', hint: 'Bootstrap cursor for first run. Leave blank to default to midnight UTC today.' },
      { key: 'attendance.runtime.debug', label: 'Debug Logging', defaultValue: 'false', type: 'boolean', hint: 'Enable verbose structured attendance logs.' },
    ],
  },
  {
    label: 'Night / Queue Reconciliation',
    fields: [
      { key: 'attendance.runtime.reconCron', label: 'Night Recon Cron', defaultValue: '0 30 1 * * *', type: 'cron', hint: 'Cron for nightly queue reconciliation. Default: 1:30 AM.', requiresRestart: true },
      { key: 'attendance.runtime.reconBatchSize', label: 'Night Recon Batch Size', defaultValue: '5000', type: 'number', hint: 'Max events per night reconciliation run. Default 5000.' },
      { key: 'attendance.runtime.reconStrategy', label: 'HIS Divergence Strategy', defaultValue: 'ACCEPT_HIS', type: 'text', hint: 'ACCEPT_HIS | ACCEPT_HDSP | ALERT_ONLY. Default ACCEPT_HIS.' },
    ],
  },
  {
    label: 'Dependency Pollers',
    fields: [
      { key: 'attendance.dependency.pollingEnabled', label: 'Dependency Polling Enabled', defaultValue: 'true', type: 'boolean', hint: 'Master switch for all dependency pollers.' },
      { key: 'attendance.dependency.pollIntervalMs', label: 'Dependency Poll Interval (ms)', defaultValue: '60000', type: 'number', hint: 'Orchestrator tick interval in ms. Default 60000 (1 min).' },
      { key: 'attendance.dependency.pollBatchSize', label: 'Dependency Poll Batch Size', defaultValue: '500', type: 'number', hint: 'Max rows per dependency poller tick. Shared by all four pollers.' },
      { key: 'attendance.dependency.dutyplanEnabled', label: 'DutyPlan Poller Enabled', defaultValue: 'true', type: 'boolean', hint: 'Enable DutyPlan (roster) change detection.' },
      { key: 'attendance.dependency.leaveEnabled', label: 'Leave Poller Enabled', defaultValue: 'true', type: 'boolean', hint: 'Enable Leave change detection.' },
      { key: 'attendance.dependency.holidayEnabled', label: 'Holiday Poller Enabled', defaultValue: 'false', type: 'boolean', hint: 'Enable Holiday change detection. Opt-in - off by default.' },
      { key: 'attendance.dependency.shiftTypeEnabled', label: 'ShiftType Poller Enabled', defaultValue: 'false', type: 'boolean', hint: 'Enable ShiftType change detection. Opt-in - off by default.' },
    ],
  },
  {
    label: 'Dependency Router & Recalculation',
    fields: [
      { key: 'attendance.dependency.routerEnabled', label: 'Dependency Router Enabled', defaultValue: 'true', type: 'boolean', hint: 'Route dependency events to re-enqueue affected attendance.' },
      { key: 'attendance.dependency.dutyplanDebounceMs', label: 'DutyPlan Debounce (ms)', defaultValue: '5000', type: 'number', hint: 'Debounce window before routing DutyPlan events. Default 5000 ms.' },
      { key: 'attendance.dependency.globalRecalcLimit', label: 'Global Recalc Limit', defaultValue: '5000', type: 'number', hint: 'Max employee-days per ALL-scope recalc (holiday). Default 5000.' },
      { key: 'attendance.dependency.configLookbackDays', label: 'Config Lookback Days', defaultValue: '7', type: 'number', hint: 'Lookback window in days when shift config changes. Default 7.' },
      { key: 'attendance.dependency.configRecalcLimit', label: 'Config Recalc Limit', defaultValue: '10000', type: 'number', hint: 'Max employee-days per config-scope recalc. Default 10000.' },
    ],
  },
  {
    label: 'HIS Reconciliation',
    fields: [
      { key: 'attendance.recon.enabled', label: 'HIS Recon Enabled', defaultValue: 'true', type: 'boolean', hint: 'Enable nightly HIS reconciliation job.' },
      { key: 'attendance.recon.cron', label: 'HIS Recon Cron', defaultValue: '0 30 3 * * *', type: 'cron', hint: 'Cron for nightly HIS reconciliation. Default: 3:30 AM.', requiresRestart: true },
      { key: 'attendance.recon.lookbackDays', label: 'HIS Recon Lookback Days', defaultValue: '1', type: 'number', hint: 'How many days back HIS recon compares. Default 1 (yesterday).' },
      { key: 'attendance.recon.batchSize', label: 'HIS Recon Batch Size', defaultValue: '10000', type: 'number', hint: 'Max Oracle rows per HIS recon run. Default 10000.' },
    ],
  },
  {
    label: 'Retroactive Recalculation',
    fields: [
      { key: 'attendance.retroactive.deptEmpLimit', label: 'Retro Dept Employee Limit', defaultValue: '5000', type: 'number', hint: 'Max employees fetched for department-scope retroactive recalc.' },
      { key: 'attendance.retroactive.batchLimit', label: 'Retro Batch Limit', defaultValue: '20000', type: 'number', hint: 'Overall cap on employee-days per retroactive recalc run.' },
    ],
  },
];

const ALL_ATTENDANCE_FIELDS = ATTENDANCE_GROUPS.flatMap(g => g.fields);

// -- Page ------------------------------------------------------------------
export default function HisSchemaConfigPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const hospitalId = params.id as string;

  // 'DB_CONNECTION' and 'ATTENDANCE' are sentinels — not real CONTRACTS keys
  const [selectedKey, setSelectedKey] = useState<string>('DB_CONNECTION');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [contractOpen, setContractOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>
    ({ open: false, msg: '', severity: 'success' });

  // DB Connection form state
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Template dialogs
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['his-config', hospitalId],
    queryFn: () => vendorApi.getHisConfig(hospitalId),
  });

  // Revised architecture (2026-07-21, CLOUD_VS_SELF_HOSTED_ROADMAP.md Phase
  // 1/3): cloud tenants DO connect directly to their own Oracle HIS
  // database -- Database Connection is now available for cloud (reversed
  // from the original Phase 2 gating, which had this backwards). Only
  // Attendance Runtime Config stays self-hosted-only, since Attendance
  // itself doesn't run for cloud deployments at all (see AttendanceModule's
  // exclusion in ZoeConnect's app.module.ts).
  const { data: hospital } = useQuery({
    queryKey: ['hospital', hospitalId],
    queryFn: () => vendorApi.getHospital(hospitalId),
  });
  const isCloud = hospital?.deploymentType === 'cloud';

  useEffect(() => {
    if (isCloud && selectedKey === 'ATTENDANCE') {
      setSelectedKey(CONTRACTS[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCloud]);

  const { data: templates, refetch: refetchTemplates } = useQuery({
    queryKey: ['his-config-templates'],
    queryFn: vendorApi.listTemplates,
  });

  useEffect(() => {
    if (!data) return;
    const map: Record<string, string> = {};
    for (const row of data) map[row.configKey] = row.configValue;
    setEdits(map);
  }, [data]);

  const contract = CONTRACTS.find(c => c.key === selectedKey) ?? CONTRACTS[0];
  const currentSql = edits[selectedKey] ?? '';

  const getStatus = (key: string) => {
    const val = edits[key] ?? '';
    if (!val.trim()) return 'empty';
    const tmpl = CONTRACTS.find(c => c.key === key)?.templateSql ?? '';
    if (val.trim() === tmpl.trim()) return 'template';
    return 'custom';
  };

  const STATUS_META = {
    empty: { label: 'Not set', color: '#999', bg: '#f5f5f5' },
    template: { label: 'Template', color: '#1565c0', bg: '#e3f2fd' },
    custom: { label: 'Custom', color: '#2e7d32', bg: '#e8f5e9' },
  };

  // -- Mutations -------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!data) return Promise.resolve([]);
      const updates = data
        .filter(row => edits[row.configKey] !== undefined && edits[row.configKey] !== row.configValue)
        .map(row => ({ configKey: row.configKey, configValue: edits[row.configKey] }));
      if (!updates.length) return Promise.resolve(data);
      return vendorApi.updateHisConfig(hospitalId, updates);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['his-config', hospitalId] }); showToast('Configuration saved.', 'success'); },
    onError: () => showToast('Failed to save.', 'error'),
  });

  const pushMutation = useMutation({
    mutationFn: () => vendorApi.pushHisConfig(hospitalId),
    onSuccess: (res) => showToast(res.message, res.ok ? 'success' : 'error'),
    onError: () => showToast('Webhook delivery failed.', 'error'),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: () => vendorApi.createTemplate(hospitalId, templateName.trim(), templateDesc.trim() || null),
    onSuccess: () => {
      setSaveDialogOpen(false);
      setTemplateName('');
      setTemplateDesc('');
      refetchTemplates();
      showToast('Template saved.', 'success');
    },
    onError: (e: any) => showToast(e?.response?.data?.message ?? 'Failed to save template.', 'error'),
  });

  // -- Test Oracle DB Connection --------------------------------------------
  const testMutation = useMutation({
    mutationFn: () => vendorApi.testDbConnection(hospitalId),
    onSuccess: (res) => {
      setTestResult(res);
      showToast(res.message, res.ok ? 'success' : 'error');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? 'Connection test failed.';
      setTestResult({ ok: false, message: msg });
      showToast(msg, 'error');
    },
  });

  // -- Sync from live ZoeConnect instance -----------------------------------------
  const syncMutation = useMutation({
    mutationFn: () => vendorApi.syncHisConfig(hospitalId),
    onSuccess: (liveConfig) => {
      // Only overwrite sql.* keys that exist in the live response
      const sqlKeys = new Set(CONTRACTS.map(c => c.key));
      const relevant = Object.fromEntries(
        Object.entries(liveConfig).filter(([k]) => sqlKeys.has(k)),
      );
      setEdits(prev => ({ ...prev, ...relevant }));
      const count = Object.keys(relevant).length;
      showToast(
        count
          ? `Synced ${count} quer${count === 1 ? 'y' : 'ies'} from live ZoeConnect instance. Review and save when ready.`
          : 'Connected to ZoeConnect but no SQL queries found on the instance yet.',
        'success',
      );
    },
    onError: (e: any) =>
      showToast(
        e?.response?.data?.message ?? 'Could not reach ZoeConnect instance. Check that the hospital is online.',
        'error',
      ),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: () => vendorApi.applyTemplate(hospitalId, selectedTemplate!),
    onSuccess: (rows) => {
      setLoadDialogOpen(false);
      setSelectedTemplate(null);
      const map: Record<string, string> = {};
      for (const row of rows) map[row.configKey] = row.configValue;
      setEdits(map);
      qc.invalidateQueries({ queryKey: ['his-config', hospitalId] });
      showToast('Template applied. Review each query and save when ready.', 'success');
    },
    onError: () => showToast('Failed to apply template.', 'error'),
  });

  const showToast = (msg: string, severity: 'success' | 'error') =>
    setToast({ open: true, msg, severity });

  const isDirty = (data?.some(row => edits[row.configKey] !== row.configValue) ?? false) ||
    ALL_ATTENDANCE_FIELDS.some(f => {
      const original = data?.find(r => r.configKey === f.key)?.configValue ?? f.defaultValue;
      return (edits[f.key] ?? f.defaultValue) !== original;
    });

  const handleLoadTemplate = () => {
    setEdits(prev => ({ ...prev, [selectedKey]: contract.templateSql }));
    textareaRef.current?.focus();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const configuredCount = CONTRACTS.filter(c => (edits[c.key] ?? '').trim() !== '').length;

  // View helpers
  const isDbView = selectedKey === 'DB_CONNECTION';
  const isAttendanceView = selectedKey === 'ATTENDANCE';
  const dbConfigured = DB_FIELDS.filter(f => f.key !== 'db.password')
    .every(f => (edits[f.key] ?? '').trim() !== '');
  const dbDirty = DB_FIELDS.some(f => {
    const original = data?.find(r => r.configKey === f.key)?.configValue ?? '';
    return (edits[f.key] ?? '') !== original;
  });

  // Phase 3 polish: the 260px-wide left navigator + flex:1 right editor
  // panel below had no responsive breakpoint at all, so on a narrow
  // viewport the navigator ate a fixed chunk of an already-tight screen and
  // the SQL editor pane was crushed. Below `md`, stack them (via the sx
  // breakpoint objects on the Box's below) -- the navigator becomes a
  // horizontally-scrolling strip capped to a fixed height instead of a
  // full-height vertical rail, so the query list stays reachable without
  // permanently consuming vertical space from the editor below it.

  // -- Render ---------------------------------------------------------------
  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top header */}
      <Box sx={{
        px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider',
        display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0,
        flexWrap: 'wrap',
        bgcolor: 'background.paper',
      }}>
        <IconButton onClick={() => router.back()} size="small" aria-label="Back"><ArrowBackIcon /></IconButton>
        <TuneIcon color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            HIS Schema Configuration
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Write raw Oracle SQL for each query. ZoeConnect executes these directly against your HIS database.
          </Typography>
        </Box>

        <Chip
          label={`${configuredCount} / ${CONTRACTS.length} configured`}
          size="small"
          sx={{
            bgcolor: configuredCount === CONTRACTS.length ? '#e8f5e9' : '#fff3e0',
            color: configuredCount === CONTRACTS.length ? '#2e7d32' : '#e65100',
            fontWeight: 600,
          }}
        />
        {isDirty && (
          <Chip icon={<WarningAmberIcon sx={{ fontSize: 13 }} />} label="Unsaved" size="small"
            sx={{ bgcolor: '#fff3e0', color: '#e65100' }} />
        )}

        {/* Save as Template */}
        <Tooltip title="Save current hospital's SQL queries as a reusable template">
          <Button size="small" variant="outlined" startIcon={<BookmarkAddIcon />}
            onClick={() => setSaveDialogOpen(true)} sx={{ fontSize: 12 }}>
            Save as Template
          </Button>
        </Tooltip>

        {/* Load Template */}
        <Tooltip title="Apply a previously saved template to this hospital">
          <Button size="small" variant="outlined" startIcon={<FolderOpenIcon />}
            onClick={() => { setLoadDialogOpen(true); refetchTemplates(); }} sx={{ fontSize: 12 }}>
            Load Template
          </Button>
        </Tooltip>

        <Tooltip title="Fetch the SQL queries currently running on the live ZoeConnect instance and load them into the editor">
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            startIcon={<SyncIcon sx={{ animation: syncMutation.isPending ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />}
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            sx={{ fontSize: 12 }}
          >
            {syncMutation.isPending ? 'Syncing...' : 'Sync from HIS'}
          </Button>
        </Tooltip>

        <Button variant="outlined" size="small" startIcon={<CloudUploadIcon />}
          onClick={() => pushMutation.mutate()} disabled={pushMutation.isPending || saveMutation.isPending}>
          {pushMutation.isPending ? 'Pushing...' : 'Push to Hospital'}
        </Button>
        <Button variant="contained" size="small" startIcon={<CheckCircleIcon />}
          onClick={() => saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mx: 3, mt: 1 }}>Failed to load HIS configuration.</Alert>}

      {/* Main body */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, overflow: 'hidden' }}>

        {/* LEFT: Navigator — DB Connection at top, then SQL queries */}
        <Box sx={{
          width: { xs: '100%', md: 260 }, flexShrink: 0, borderRight: { xs: 0, md: 1 },
          borderBottom: { xs: 1, md: 0 }, borderColor: 'divider',
          maxHeight: { xs: 160, md: 'none' },
          overflowY: { xs: 'auto', md: 'auto' },
          bgcolor: 'grey.50',
        }}>
          {/* DB Connection entry -- available for both deployment types, see isCloud above */}
          <Box onClick={() => setSelectedKey('DB_CONNECTION')} sx={{
            px: 2, py: 1.25, cursor: 'pointer',
            borderBottom: 1, borderColor: 'divider', borderLeft: 3,
            borderLeftColor: isDbView ? 'primary.main' : 'transparent',
            bgcolor: isDbView ? 'primary.50' : 'transparent',
            '&:hover': { bgcolor: isDbView ? 'primary.50' : 'action.hover' },
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StorageIcon sx={{ fontSize: 14, color: isDbView ? 'primary.main' : 'text.disabled' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={isDbView ? 700 : 600}
                  sx={{ fontSize: 12, lineHeight: 1.3, color: isDbView ? 'primary.main' : 'text.primary' }}>
                  Database Connection
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled' }}>
                  Oracle credentials &amp; pool settings
                </Typography>
              </Box>
            </Box>
            <Box sx={{ mt: 0.5, ml: 2.5 }}>
              <Chip
                label={dbConfigured ? 'Configured' : 'Not set'}
                size="small"
                sx={{
                  bgcolor: dbConfigured ? '#e8f5e9' : '#f5f5f5',
                  color: dbConfigured ? '#2e7d32' : '#999',
                  fontSize: 10, height: 16, fontWeight: 600,
                }}
              />
            </Box>
          </Box>

          {/* Attendance section -- self-hosted only, see isCloud above */}
          {!isCloud && (() => {
            const attendanceConfigured = ALL_ATTENDANCE_FIELDS.filter(f => {
              const val = edits[f.key] ?? f.defaultValue;
              return val.trim() !== f.defaultValue.trim() && val.trim() !== '';
            }).length;
            const isActive = selectedKey === 'ATTENDANCE';
            return (
              <Box onClick={() => setSelectedKey('ATTENDANCE')} sx={{
                px: 2, py: 1.25, cursor: 'pointer',
                borderBottom: 1, borderColor: 'divider', borderLeft: 3,
                borderLeftColor: isActive ? 'primary.main' : 'transparent',
                bgcolor: isActive ? 'primary.50' : 'transparent',
                '&:hover': { bgcolor: isActive ? 'primary.50' : 'action.hover' },
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WifiTetheringIcon sx={{ fontSize: 14, color: isActive ? 'primary.main' : 'text.disabled' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={isActive ? 700 : 600}
                      sx={{ fontSize: 12, lineHeight: 1.3, color: isActive ? 'primary.main' : 'text.primary' }}>
                      Attendance Runtime Config
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled' }}>
                      {ALL_ATTENDANCE_FIELDS.length} variables
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 0.5, ml: 2.5 }}>
                  <Chip
                    label={attendanceConfigured > 0 ? `${attendanceConfigured} overridden` : 'Using defaults'}
                    size="small"
                    sx={{
                      bgcolor: attendanceConfigured > 0 ? '#e8f5e9' : '#f5f5f5',
                      color: attendanceConfigured > 0 ? '#2e7d32' : '#999',
                      fontSize: 10, height: 16, fontWeight: 600,
                    }}
                  />
                </Box>
              </Box>
            );
          })()}

          {/* Divider + SQL queries section */}
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              SQL Queries ({CONTRACTS.length})
            </Typography>
          </Box>

          {CONTRACTS.map(c => {
            const st = getStatus(c.key);
            const meta = STATUS_META[st];
            const isActive = c.key === selectedKey;
            return (
              <Box key={c.key} onClick={() => setSelectedKey(c.key)} sx={{
                px: 2, py: 1.25, cursor: 'pointer',
                borderBottom: 1, borderColor: 'divider', borderLeft: 3,
                borderLeftColor: isActive ? 'primary.main' : 'transparent',
                bgcolor: isActive ? 'primary.50' : 'transparent',
                '&:hover': { bgcolor: isActive ? 'primary.50' : 'action.hover' },
              }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <CodeIcon sx={{ fontSize: 14, color: isActive ? 'primary.main' : 'text.disabled', mt: 0.25 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={isActive ? 700 : 500}
                      sx={{ fontSize: 12, lineHeight: 1.3, color: isActive ? 'primary.main' : 'text.primary' }}>
                      {c.title}
                    </Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 10, color: 'text.disabled' }}>
                      {c.service}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ mt: 0.5, ml: 2.5 }}>
                  <Chip label={meta.label} size="small"
                    sx={{ bgcolor: meta.bg, color: meta.color, fontSize: 10, height: 16, fontWeight: 600 }} />
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* RIGHT panel — DB Connection form OR SQL editor */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

          {/* ── DB CONNECTION FORM ───────────────────────────────────────────── */}
          {isDbView && (
            <Box sx={{ flex: 1, p: 3, maxWidth: 680 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                <StorageIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={700}>Database Connection</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Oracle credentials for this hospital's HIS database. These are pushed to the ZoeConnect instance
                via the "Push to Hospital" button and applied at runtime — no <code>.env</code> changes needed.
              </Typography>

              <Alert severity="info" sx={{ mb: 3, fontSize: 13 }}>
                The DB password is stored in the vendor portal database. On push, it travels over the
                signed webhook (HMAC-SHA256). Leave the password field blank to keep the existing
                password on the ZoeConnect instance unchanged.
              </Alert>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {DB_FIELDS.map(field => {
                  const val = edits[field.key] ?? '';

                  if (field.type === 'select') {
                    return (
                      <FormControl key={field.key} size="small" fullWidth>
                        <InputLabel>{field.label}</InputLabel>
                        <Select
                          value={val || 'thin'}
                          label={field.label}
                          onChange={e => setEdits(prev => ({ ...prev, [field.key]: e.target.value }))}
                        >
                          <MenuItem value="thin">thin — pure JS driver (recommended)</MenuItem>
                          <MenuItem value="thick">thick — requires Oracle Instant Client</MenuItem>
                        </Select>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 0.25 }}>
                          {field.hint}
                        </Typography>
                      </FormControl>
                    );
                  }

                  if (field.type === 'password') {
                    return (
                      <TextField
                        key={field.key}
                        size="small"
                        fullWidth
                        label={field.label}
                        type={showPassword ? 'text' : 'password'}
                        value={val}
                        placeholder={val ? '' : '(unchanged on ZoeConnect if left blank)'}
                        onChange={e => setEdits(prev => ({ ...prev, [field.key]: e.target.value }))}
                        helperText={field.hint}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton size="small" onClick={() => setShowPassword(p => !p)} edge="end" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    );
                  }

                  return (
                    <TextField
                      key={field.key}
                      size="small"
                      fullWidth
                      label={field.label}
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={val}
                      placeholder={field.placeholder}
                      onChange={e => setEdits(prev => ({ ...prev, [field.key]: e.target.value }))}
                      helperText={field.hint}
                    />
                  );
                })}
              </Box>

              {/* Test result */}
              {testResult && (
                <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ mt: 2 }}
                  onClose={() => setTestResult(null)}>
                  {testResult.message}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 1.5, mt: 3 }}>
                <Tooltip title="Save credentials first, then test the connection against the live ZoeConnect instance">
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<WifiTetheringIcon />}
                    onClick={() => { setTestResult(null); testMutation.mutate(); }}
                    disabled={testMutation.isPending || !dbConfigured}
                  >
                    {testMutation.isPending ? 'Testing...' : 'Test Connection'}
                  </Button>
                </Tooltip>
                <Button
                  variant="contained"
                  startIcon={<CheckCircleIcon />}
                  onClick={() => saveMutation.mutate()}
                  disabled={!dbDirty || saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save Credentials'}
                </Button>
              </Box>

              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5 }}>
                After saving, use "Push to Hospital" in the top bar to apply credentials to the live ZoeConnect instance.
              </Typography>
            </Box>
          )}

          {/* ATTENDANCE RUNTIME CONFIG FORM */}
          {selectedKey === 'ATTENDANCE' && (
            <Box sx={{ flex: 1, p: 3, maxWidth: 780, overflowY: 'auto' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                <WifiTetheringIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={700}>Attendance Runtime Config</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Per-hospital attendance runtime settings. Values override the ZoeConnect .env file without a restart
                (except cron fields). Leave a field at its default to use the existing ZoeConnect value.
              </Typography>
              <Alert severity="info" sx={{ mb: 3, fontSize: 13 }}>
                After editing, click <strong>Save Changes</strong> then <strong>Push to Hospital</strong>.
                Changes take effect immediately on ZoeConnect except fields marked "Requires restart".
              </Alert>
              {ATTENDANCE_GROUPS.map(group => (
                <Box key={group.label} sx={{ mb: 3 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1.5 }}>
                    {group.label}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {group.fields.map(field => {
                      const val = edits[field.key] ?? field.defaultValue;
                      if (field.type === 'boolean') {
                        return (
                          <FormControl key={field.key} size="small" fullWidth>
                            <InputLabel>{field.label}</InputLabel>
                            <Select
                              value={val || field.defaultValue}
                              label={field.label}
                              onChange={e => setEdits(prev => ({ ...prev, [field.key]: e.target.value }))}
                            >
                              <MenuItem value="true">true (enabled)</MenuItem>
                              <MenuItem value="false">false (disabled)</MenuItem>
                            </Select>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 0.25 }}>
                              {field.hint}
                            </Typography>
                          </FormControl>
                        );
                      }
                      return (
                        <TextField
                          key={field.key}
                          size="small"
                          fullWidth
                          label={field.label}
                          value={val}
                          placeholder={field.defaultValue || '(blank = use default)'}
                          onChange={e => setEdits(prev => ({ ...prev, [field.key]: e.target.value }))}
                          helperText={
                            <span>
                              {field.hint}
                              {field.requiresRestart && (
                                <span style={{ color: '#e65100', fontWeight: 600, marginLeft: 6 }}>
                                  Requires restart
                                </span>
                              )}
                              {' '}
                              <span style={{ color: '#bbb' }}>(default: {field.defaultValue || 'empty'})</span>
                            </span>
                          }
                        />
                      );
                    })}
                  </Box>
                </Box>
              ))}
              <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
                <Button variant="contained" startIcon={<CheckCircleIcon />}
                  onClick={() => saveMutation.mutate()}
                  disabled={!isDirty || saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outlined" startIcon={<CloudUploadIcon />}
                  onClick={() => pushMutation.mutate()} disabled={pushMutation.isPending}>
                  {pushMutation.isPending ? 'Pushing...' : 'Push to Hospital'}
                </Button>
              </Box>
            </Box>
          )}

          {/* SQL QUERY EDITOR */}
          {!isDbView && !isAttendanceView && (<>

            {/* Query title bar */}
            <Box sx={{
              px: 2.5, py: 1.25, borderBottom: 1, borderColor: 'divider',
              display: 'flex', alignItems: 'center', gap: 1.5,
              bgcolor: 'background.paper', flexShrink: 0,
            }}>
              <EditNoteIcon color="primary" sx={{ fontSize: 20 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={700}>{contract.title}</Typography>
                <Typography variant="caption" color="text.secondary">{contract.description}</Typography>
              </Box>
              <Tooltip title="Load the default template SQL as a starting point">
                <Button size="small" variant="outlined" startIcon={<RestartAltIcon />}
                  onClick={handleLoadTemplate} sx={{ fontSize: 12 }}>
                  Load Default SQL
                </Button>
              </Tooltip>
              <Tooltip title={copied ? 'Copied!' : 'Copy SQL to clipboard'}>
                <IconButton size="small" onClick={handleCopy} disabled={!currentSql} aria-label="Copy SQL to clipboard">
                  {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>

            {/* Contract panel */}
            <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider', bgcolor: '#fafafa' }}>
              <Box sx={{ px: 2.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
                onClick={() => setContractOpen(o => !o)}>
                <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" fontWeight={700} color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
                  Query Contract
                </Typography>
                <IconButton size="small" aria-label={contractOpen ? 'Collapse query contract' : 'Expand query contract'}>
                  {contractOpen ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                </IconButton>
              </Box>

              <Collapse in={contractOpen}>
                <Box sx={{ px: 2.5, pb: 1.5 }}>
                  <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>

                    {/* Required aliases */}
                    <Box sx={{ flex: 1, minWidth: 280 }}>
                      <Typography variant="caption" fontWeight={700} color="text.secondary"
                        sx={{ display: 'block', mb: 0.75, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                        Required output aliases
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {contract.required.map(alias => (
                          <Chip key={alias} label={alias} size="small" sx={{
                            fontFamily: 'monospace', fontSize: 11, height: 20,
                            bgcolor: '#1565c011', color: '#1565c0', fontWeight: 500,
                          }} />
                        ))}
                      </Box>
                    </Box>

                    {/* Bind params */}
                    {contract.binds.length > 0 && (
                      <Box sx={{ minWidth: 160 }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary"
                          sx={{ display: 'block', mb: 0.75, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                          Bind parameters
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {contract.binds.map(b => (
                            <Chip key={b} label={b} size="small" sx={{
                              fontFamily: 'monospace', fontSize: 11, height: 20,
                              bgcolor: '#9cdcfe22', color: '#0e639c', fontWeight: 600,
                            }} />
                          ))}
                        </Box>
                      </Box>
                    )}

                    {/* Structured notes */}
                    <Box sx={{ flex: 2, minWidth: 300 }}>
                      <Typography variant="caption" fontWeight={700} color="text.secondary"
                        sx={{ display: 'block', mb: 0.75, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                        Rules &amp; requirements
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {contract.notes.map((note, i) => {
                          const style = NOTE_STYLE[note.tag];
                          return (
                            <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                              <Box sx={{
                                px: 0.75, py: 0.15, borderRadius: 0.5, flexShrink: 0,
                                bgcolor: style.bg, color: style.color,
                                fontSize: 10, fontWeight: 700, lineHeight: 1.6,
                                letterSpacing: 0.3, minWidth: 46, textAlign: 'center',
                              }}>
                                {note.tag}
                              </Box>
                              <Typography variant="caption" color="text.secondary"
                                sx={{ lineHeight: 1.6, pt: 0.1 }}>
                                {note.text}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Collapse>
            </Box>

            {/* SQL editor */}
            <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {isLoading ? (
                <Box sx={{ p: 3 }}><Skeleton height={400} variant="rectangular" /></Box>
              ) : (
                <>
                  <Box sx={{
                    px: 2.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1,
                    bgcolor: '#1e1e1e', borderBottom: '1px solid #333', flexShrink: 0,
                  }}>
                    <Typography sx={{ fontSize: 11, color: '#858585', fontFamily: 'monospace', flex: 1 }}>
                      Oracle SQL  {currentSql ? `— ${currentSql.split('\n').length} lines` : '— empty'}
                    </Typography>
                    {(() => {
                      const st = getStatus(selectedKey);
                      return <Typography sx={{ fontSize: 11, color: STATUS_META[st].color, fontFamily: 'monospace' }}>{STATUS_META[st].label}</Typography>;
                    })()}
                  </Box>

                  <Box sx={{ position: 'relative' }}>
                    <textarea
                      ref={textareaRef}
                      value={currentSql}
                      onChange={e => setEdits(prev => ({ ...prev, [selectedKey]: e.target.value }))}
                      placeholder={`-- Write your Oracle SQL here\n-- Click "Load Default SQL" above to start from the built-in template\n-- or "Load Template" in the header to apply a saved schema template\n\nSELECT\n  ...\nFROM your_table t\nWHERE t.your_mrn_col = :mrn`}
                      spellCheck={false}
                      style={{
                        display: 'block', width: '100%', minHeight: 420,
                        resize: 'vertical', border: 'none', outline: 'none',
                        padding: '16px 20px',
                        fontFamily: '"Cascadia Code","Fira Code",Consolas,monospace',
                        fontSize: 13, lineHeight: 1.7,
                        color: '#d4d4d4', backgroundColor: '#1e1e1e', caretColor: '#d4d4d4',
                        boxSizing: 'border-box', tabSize: 2,
                        overflowY: 'auto',
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          const ta = e.currentTarget;
                          const start = ta.selectionStart;
                          const end = ta.selectionEnd;
                          const next = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
                          setEdits(prev => ({ ...prev, [selectedKey]: next }));
                          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
                        }
                      }}
                    />
                  </Box>
                </>
              )}
            </Box>
          </>)}
          {/* end sql editor */}

        </Box>
      </Box>

      {/* ── Save as Template dialog ── */}
      <ResponsiveDialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Save as Template</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary">
            Captures all 8 SQL queries currently saved for this hospital into a named, reusable template.
            Other hospitals can then load this template instead of writing SQL from scratch.
          </Typography>
          <TextField
            label="Template name" size="small" fullWidth autoFocus
            value={templateName} onChange={e => setTemplateName(e.target.value)}
            placeholder="e.g. Apollo HIS v3, Medisoft Standard"
            helperText="Must be unique across all templates."
          />
          <TextField
            label="Description (optional)" size="small" fullWidth multiline rows={2}
            value={templateDesc} onChange={e => setTemplateDesc(e.target.value)}
            placeholder="e.g. Default schema for Medisoft HIS installations with salutation lookup"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!templateName.trim() || saveTemplateMutation.isPending}
            onClick={() => saveTemplateMutation.mutate()}
          >
            {saveTemplateMutation.isPending ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* ── Load Template dialog ── */}
      <ResponsiveDialog open={loadDialogOpen} onClose={() => setLoadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Load Template</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Select a template to apply to this hospital. All 8 SQL queries will be overwritten with the
            template values. You can review and adjust each query before saving.
          </Typography>
          {!templates?.length ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              No templates saved yet. Configure a hospital and click "Save as Template".
            </Typography>
          ) : (
            <List dense disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
              {templates.map((t: HisConfigTemplate, i: number) => (
                <Box key={t.id}>
                  {i > 0 && <Divider />}
                  <ListItemButton
                    selected={selectedTemplate === t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    sx={{ borderRadius: 0 }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight={600}>{t.name}</Typography>
                          <Typography variant="caption" color="text.disabled">
                            {new Date(t.createdAt).toLocaleDateString()}
                          </Typography>
                        </Box>
                      }
                      secondary={t.description ?? 'No description'}
                    />
                  </ListItemButton>
                </Box>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLoadDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!selectedTemplate || applyTemplateMutation.isPending}
            onClick={() => applyTemplateMutation.mutate()}
          >
            {applyTemplateMutation.isPending ? 'Applying...' : 'Apply Template'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* Toast */}
      <Snackbar open={toast.open} autoHideDuration={5000}
        onClose={() => setToast(p => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} onClose={() => setToast(p => ({ ...p, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
