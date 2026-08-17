import { Router } from 'express';
import { getCabinOccupancy, getInvoiceAnalysis, getConcessionReport } from '../controller/reportsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const ADMIN = authorize('Admin', 'SuperAdmin');

router.use(authenticate, ADMIN);

router.get('/cabin-occupancy',  getCabinOccupancy);
router.get('/invoice-analysis', getInvoiceAnalysis);
router.get('/concession',       getConcessionReport);

export default router;
