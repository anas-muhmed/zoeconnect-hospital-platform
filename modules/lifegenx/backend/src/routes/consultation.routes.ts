import { Router } from 'express';
import {
  createConsultation,
  getConsultations,
  getConsultation,
  getMetrics
} from '../controllers/consultation.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authenticateJWT, createConsultation);
router.get('/', authenticateJWT, getConsultations);
router.get('/metrics/dashboard', authenticateJWT, getMetrics);
router.get('/:id', authenticateJWT, getConsultation);

export default router;
