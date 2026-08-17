import { api } from './api';
import { ConsultationRecord, DashboardMetrics } from '../types';

export interface GetConsultationsParams {
  search?: string;
  doctorName?: string;
  patientName?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const consultationService = {
  saveConsultation: async (data: Partial<ConsultationRecord>): Promise<ConsultationRecord> => {
    const res = await api.post('/consultations', data);
    return res.data.data;
  },

  getConsultations: async (params?: GetConsultationsParams) => {
    const res = await api.get('/consultations', { params });
    return res.data.data;
  },

  getConsultationById: async (id: string): Promise<ConsultationRecord> => {
    const res = await api.get(`/consultations/${id}`);
    return res.data.data;
  },

  getDashboardMetrics: async (): Promise<DashboardMetrics> => {
    const res = await api.get('/consultations/metrics/dashboard');
    return res.data.data;
  }
};
