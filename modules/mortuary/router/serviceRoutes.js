import { Router } from 'express';
import { getServices, createService, updateService, deleteService } from '../controller/serviceController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');
const ADMIN = authorize('Admin', 'SuperAdmin');

router.use(authenticate);

router.get('/',       STAFF, getServices);
router.post('/',      ADMIN, createService);
router.put('/:id',    ADMIN, updateService);
router.delete('/:id', ADMIN, deleteService);

export default router;
