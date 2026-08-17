import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { createConsultationSchema } from '../validators/consultation.validator';
import {
  createConsultationRecord,
  getConsultationsList,
  getConsultationById,
  getDashboardMetrics
} from '../services/consultation.service';
import { sendSuccess, sendError } from '../utils/responseHandler';

export async function createConsultation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const validated = createConsultationSchema.parse(req.body);
    const doctorId = req.user?.id || 'demo-doctor-id';

    const consultation = await createConsultationRecord(doctorId, validated);
    return sendSuccess(res, consultation, 'Consultation saved successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getConsultations(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { search, doctorName, patientName, startDate, endDate, page, limit } = req.query;

    const options = {
      search: search as string,
      doctorName: doctorName as string,
      patientName: patientName as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 10
    };

    const result = await getConsultationsList(options);
    return sendSuccess(res, result, 'Consultation history fetched');
  } catch (error) {
    next(error);
  }
}

export async function getConsultation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const consultation = await getConsultationById(id);

    if (!consultation) {
      return sendError(res, 'Consultation record not found', 404);
    }

    return sendSuccess(res, consultation, 'Consultation record details retrieved');
  } catch (error) {
    next(error);
  }
}

export async function getMetrics(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const metrics = await getDashboardMetrics();
    return sendSuccess(res, metrics, 'Dashboard metrics retrieved');
  } catch (error) {
    next(error);
  }
}
