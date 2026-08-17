import { Router } from 'express';
import { getServiceBillingFull, settleServiceBilling } from '../controller/billingController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');

router.use(authenticate, STAFF);

router.post('/settle',   settleServiceBilling);
router.get('/:id/full',  getServiceBillingFull);

export default router;
