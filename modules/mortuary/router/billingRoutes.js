import { Router } from 'express';
import {
  getBilling,
  getBillingFull,
  getBillingByBodyId,
  generateBilling,
  settleBilling
} from '../controller/billingController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');

router.use(authenticate);

// Specific named routes must come before param routes
router.post('/generate',  STAFF, generateBilling);
router.post('/settle',    STAFF, settleBilling);
router.get('/',           STAFF, getBilling);
router.get('/:id/full',   STAFF, getBillingFull);
router.get('/:bodyId',    STAFF, getBillingByBodyId);

export default router;
