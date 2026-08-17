import { Router } from 'express';
import { getReleaseHistory } from '../controller/releaseController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');

router.get('/', authenticate, STAFF, getReleaseHistory);

export default router;
