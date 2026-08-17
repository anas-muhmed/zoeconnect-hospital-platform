import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { generateId } from "./idGen";

export type Gender = "male" | "female" | "";

export interface Visit {
  id: string;
  date: string;
  height: string;
  weight: string;
  headCirc: string;
}

export interface TDSCMarks {
  visitId: string;
  markedItems: number[]; // array of item IDs that were achieved at this visit
}

export interface PatientData {
  patientName: string;
  dob: string;
  gender: Gender;
  gaAtBirth: string;
  visits: Visit[];
  tdscMarks?: TDSCMarks[];    // marks for TDSC 0-3 chart
  tdscMarks36?: TDSCMarks[];  // marks for TDSC 3-6 chart
}

export interface HomeFormState {
  patientName: string;
  dob: string;
  gender: Gender;
  gaAtBirth: string;
  visits: Visit[];
  plotted: boolean;
}

const STORAGE_KEY_PATIENT = "clinigrowth_patient";
const STORAGE_KEY_HOMEFORM = "clinigrowth_homeform";
const STORAGE_KEY_PATIENT_WHO = "clinigrowth_patient_who";
const STORAGE_KEY_HOMEFORM_WHO = "clinigrowth_homeform_who";

function newVisit(): Visit { return { id: generateId(), date: "", height: "", weight: "", headCirc: "" }; }
const DEFAULT_VISIT: Visit = newVisit();

const DEFAULT_FORM: HomeFormState = {
  patientName: "",
  dob: "",
  gender: "",
  gaAtBirth: "",
  visits: [DEFAULT_VISIT],
  plotted: false,
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded — ignore */ }
}

interface GrowchartContextType {
  patient: PatientData | null;
  setPatient: (p: PatientData) => void;
  homeForm: HomeFormState;
  setHomeForm: (f: HomeFormState | ((prev: HomeFormState) => HomeFormState)) => void;
  patientWho: PatientData | null;
  setPatientWho: (p: PatientData) => void;
  homeFormWho: HomeFormState;
  setHomeFormWho: (f: HomeFormState | ((prev: HomeFormState) => HomeFormState)) => void;
}

const GrowchartContext = createContext<GrowchartContextType>({
  patient: null,
  setPatient: () => { },
  homeForm: DEFAULT_FORM,
  setHomeForm: () => { },
  patientWho: null,
  setPatientWho: () => { },
  homeFormWho: DEFAULT_FORM,
  setHomeFormWho: () => { },
});

export function GrowchartProvider({ children }: { children: ReactNode }) {
  const [patient, setPatientState] = useState<PatientData | null>(() => loadFromStorage<PatientData | null>(STORAGE_KEY_PATIENT, null));
  const [homeForm, setHomeFormState] = useState<HomeFormState>(() => loadFromStorage<HomeFormState>(STORAGE_KEY_HOMEFORM, DEFAULT_FORM));
  const [patientWho, setPatientWhoState] = useState<PatientData | null>(() => loadFromStorage<PatientData | null>(STORAGE_KEY_PATIENT_WHO, null));
  const [homeFormWho, setHomeFormWhoState] = useState<HomeFormState>(() => loadFromStorage<HomeFormState>(STORAGE_KEY_HOMEFORM_WHO, DEFAULT_FORM));

  const setPatient = useCallback((p: PatientData) => {
    setPatientState(p);
    saveToStorage(STORAGE_KEY_PATIENT, p);
  }, []);

  const setHomeForm = useCallback((f: HomeFormState | ((prev: HomeFormState) => HomeFormState)) => {
    setHomeFormState(prev => {
      const next = typeof f === "function" ? (f as (prev: HomeFormState) => HomeFormState)(prev) : f;
      saveToStorage(STORAGE_KEY_HOMEFORM, next);
      return next;
    });
  }, []);

  const setPatientWho = useCallback((p: PatientData) => {
    setPatientWhoState(p);
    saveToStorage(STORAGE_KEY_PATIENT_WHO, p);
  }, []);

  const setHomeFormWho = useCallback((f: HomeFormState | ((prev: HomeFormState) => HomeFormState)) => {
    setHomeFormWhoState(prev => {
      const next = typeof f === "function" ? (f as (prev: HomeFormState) => HomeFormState)(prev) : f;
      saveToStorage(STORAGE_KEY_HOMEFORM_WHO, next);
      return next;
    });
  }, []);

  return (
    <GrowchartContext.Provider value={{ patient, setPatient, homeForm, setHomeForm, patientWho, setPatientWho, homeFormWho, setHomeFormWho }}>
      {children}
    </GrowchartContext.Provider>
  );
}

export function useGrowchart() {
  return useContext(GrowchartContext);
}