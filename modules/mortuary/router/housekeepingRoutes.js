import { Router } from 'express';
import { getTasks, assignTask, completeTask, verifyTask } from '../controller/housekeepingController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');

router.use(authenticate);

router.get('/tasks',      STAFF, getTasks);
router.post('/assign',    STAFF, assignTask);
router.post('/complete',  STAFF, completeTask);
router.post('/verify',    STAFF, verifyTask);

export default router;
