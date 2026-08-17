import { api } from './api';
import { UploadAudioResponse, TranscribeResponse, ExtractedSymptomsResponse, DiagnosisResponse } from '../types';

export const aiService = {
  uploadAudio: async (file: File): Promise<UploadAudioResponse> => {
    const formData = new FormData();
    formData.append('audio', file);

    const res = await api.post('/audio/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data.data;
  },

  transcribeAudio: async (audioId: string, language?: 'english' | 'malayalam'): Promise<TranscribeResponse> => {
    const res = await api.post('/ai/transcribe', { audioId, language });
    return res.data.data;
  },

  extractSymptoms: async (transcript: string): Promise<ExtractedSymptomsResponse> => {
    const res = await api.post('/ai/extract', { transcript });
    return res.data.data;
  },

  generateDiagnosis: async (symptoms: string[], observations: string[]): Promise<DiagnosisResponse> => {
    const res = await api.post('/ai/diagnosis', { symptoms, observations });
    return res.data.data;
  },

  askZoiBot: async (userInput: string): Promise<{ response: string }> => {
    const res = await api.post('/ai/zoibot', { userInput });
    return res.data.data;
  }
};

