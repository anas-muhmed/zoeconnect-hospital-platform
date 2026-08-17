import { create } from 'zustand';
import { DiagnosisItem } from '../types';

interface ConsultationState {
  // Patient details
  patientName: string;
  patientAge: string;
  patientGender: string;
  
  // Audio state
  audioId: string | null;
  audioFileName: string | null;
  audioUrl: string | null;
  audioDuration: string | null;
  
  // Language preferences
  language: 'english' | 'malayalam';

  // Clinical pipeline data
  transcript: string;
  malayalamTranscript: string;
  symptoms: string[];
  observations: string[];
  diagnoses: DiagnosisItem[];

  // Processing indicators
  isUploading: boolean;
  isTranscribing: boolean;
  isExtracting: boolean;
  isGeneratingDiagnosis: boolean;
  isSaving: boolean;

  // Actions
  setPatientDetails: (details: { patientName?: string; patientAge?: string; patientGender?: string }) => void;
  setAudioData: (data: { audioId: string; fileName: string; url?: string; duration?: string }) => void;
  setLanguage: (language: 'english' | 'malayalam') => void;
  setTranscript: (transcript: string) => void;
  setMalayalamTranscript: (malayalamTranscript: string) => void;
  setSymptoms: (symptoms: string[]) => void;
  addSymptom: (symptom: string) => void;
  removeSymptom: (index: number) => void;
  setObservations: (observations: string[]) => void;
  addObservation: (observation: string) => void;
  removeObservation: (index: number) => void;
  setDiagnoses: (diagnoses: DiagnosisItem[]) => void;
  
  setProcessingState: (key: 'isUploading' | 'isTranscribing' | 'isExtracting' | 'isGeneratingDiagnosis' | 'isSaving', value: boolean) => void;
  resetWorkspace: () => void;
  loadSampleConsultation: () => void;
}

const initialSampleState = {
  patientName: 'David Miller',
  patientAge: '56',
  patientGender: 'Male',
  audioId: 'sample-audio-001',
  audioFileName: 'Doctor_Patient_Consultation_001.mp3',
  audioUrl: '/sample-audio.mp3',
  audioDuration: '03:15',
  language: 'english' as const,
  transcript:
    "Doctor: Hello Mr. Miller, how can I help you today?\n" +
    "Patient: Hi Doctor, I've had a persistent high fever for 3 days, accompanied by a dry hacking cough and a pounding headache.\n" +
    "Doctor: Are you experiencing any chest pain, nausea, or shortness of breath?\n" +
    "Patient: No chest pain or nausea, but I feel extremely fatigued and my muscles ache all over.\n" +
    "Doctor: What about medical history?\n" +
    "Patient: I am 56 years old, diagnosed with Type 2 Diabetes 5 years ago, and hypertension. I smoke half a pack a day. No allergies to medications.",
  malayalamTranscript: '',
  symptoms: ['Fever', 'Dry cough', 'Headache', 'Muscle aches', 'Fatigue'],
  observations: [
    'Age: 56',
    'Male',
    'Known diabetic (Type 2)',
    'Hypertension',
    'Smoker (0.5 pack/day)',
    'No chest pain',
    'No nausea',
    'No drug allergies'
  ],
  diagnoses: [
    {
      name: 'Acute Viral Respiratory Tract Infection (e.g. Influenza A)',
      confidence: '87%',
      recommendedTests: ['Complete Blood Count (CBC)', 'C-Reactive Protein (CRP)', 'Rapid Viral Antigen PCR', 'Chest X-Ray']
    },
    {
      name: 'Acute Bronchitis (Diabetic Risk Warning)',
      confidence: '64%',
      recommendedTests: ['Sputum Culture', 'Pulse Oximetry', 'Fasting Blood Glucose / HbA1c Panel']
    },
    {
      name: 'Early Community-Acquired Pneumonia (CAP)',
      confidence: '42%',
      recommendedTests: ['High-Resolution CT Chest', 'Procalcitonin Level', 'Blood Cultures']
    }
  ]
};

export const useConsultationStore = create<ConsultationState>((set) => ({
  patientName: '',
  patientAge: '',
  patientGender: 'Male',

  audioId: null,
  audioFileName: null,
  audioUrl: null,
  audioDuration: null,
  
  language: 'english',

  transcript: '',
  malayalamTranscript: '',
  symptoms: [],
  observations: [],
  diagnoses: [],

  isUploading: false,
  isTranscribing: false,
  isExtracting: false,
  isGeneratingDiagnosis: false,
  isSaving: false,

  setPatientDetails: (details) =>
    set((state) => ({
      patientName: details.patientName !== undefined ? details.patientName : state.patientName,
      patientAge: details.patientAge !== undefined ? details.patientAge : state.patientAge,
      patientGender: details.patientGender !== undefined ? details.patientGender : state.patientGender
    })),

  setAudioData: (data) =>
    set({
      audioId: data.audioId,
      audioFileName: data.fileName,
      audioUrl: data.url || null,
      audioDuration: data.duration || null
    }),

  setLanguage: (language) => set({ language }),

  setTranscript: (transcript) => set({ transcript }),

  setMalayalamTranscript: (malayalamTranscript) => set({ malayalamTranscript }),

  setSymptoms: (symptoms) => set({ symptoms }),
  addSymptom: (symptom) =>
    set((state) => ({
      symptoms: state.symptoms.includes(symptom) ? state.symptoms : [...state.symptoms, symptom]
    })),
  removeSymptom: (index) =>
    set((state) => ({
      symptoms: state.symptoms.filter((_, i) => i !== index)
    })),

  setObservations: (observations) => set({ observations }),
  addObservation: (observation) =>
    set((state) => ({
      observations: [...state.observations, observation]
    })),
  removeObservation: (index) =>
    set((state) => ({
      observations: state.observations.filter((_, i) => i !== index)
    })),

  setDiagnoses: (diagnoses) => set({ diagnoses }),

  setProcessingState: (key, value) => set({ [key]: value }),

  resetWorkspace: () =>
    set({
      patientName: '',
      patientAge: '',
      patientGender: 'Male',
      audioId: null,
      audioFileName: null,
      audioUrl: null,
      audioDuration: null,
      language: 'english',
      transcript: '',
      malayalamTranscript: '',
      symptoms: [],
      observations: [],
      diagnoses: [],
      isUploading: false,
      isTranscribing: false,
      isExtracting: false,
      isGeneratingDiagnosis: false,
      isSaving: false
    }),

  loadSampleConsultation: () => set(initialSampleState)
}));
