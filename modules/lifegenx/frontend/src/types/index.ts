export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface UploadAudioResponse {
  audioId: string;
  fileName: string;
  duration: string;
  size?: string;
  filePath?: string;
  url?: string;
}

export interface TranscribeResponse {
  transcript: string;
  malayalamTranscript?: string;
}

export interface ExtractedSymptomsResponse {
  symptoms: string[];
  observations: string[];
}

export interface DiagnosisItem {
  name: string;
  confidence: string;
  recommendedTests: string[];
}

export interface DiagnosisResponse {
  diagnoses: DiagnosisItem[];
}

export interface ConsultationRecord {
  id: string;
  patientName: string;
  patientAge?: number | null;
  patientGender?: string | null;
  audioPath?: string | null;
  audioFileName?: string | null;
  duration?: string | null;
  transcript: string;
  symptoms: string[];
  observations: string[];
  diagnoses: DiagnosisItem[];
  doctorId: string;
  doctor?: {
    id: string;
    name: string;
    email: string;
    department: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DashboardMetrics {
  totalConsultations: number;
  todayDiagnoses: number;
  todayAudioUploaded: number;
  recentConsultations: ConsultationRecord[];
}
