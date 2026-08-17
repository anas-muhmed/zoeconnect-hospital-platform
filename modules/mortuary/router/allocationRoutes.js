import { Router } from 'express';
import {
  createAllocation,
  getAllocations,
  releaseAllocation,
  extendAllocation,
  calculateAllocation
} from '../controller/allocationController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');

router.use(authenticate);

router.post('/',                  STAFF, createAllocation);
router.get('/',                   STAFF, getAllocations);
router.put('/:id/release',        STAFF, releaseAllocation);
router.put('/:id/extend',         STAFF, extendAllocation);
router.get('/:id/calculate',      STAFF, calculateAllocation);

export default router;
