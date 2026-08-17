import { Router } from 'express';
import { getCabins, createCabin, updateCabin, deleteCabin } from '../controller/cabinController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');
const ADMIN = authorize('Admin', 'SuperAdmin');

router.use(authenticate);

router.get('/',        STAFF, getCabins);
router.post('/',       ADMIN, createCabin);
router.put('/:id',     ADMIN, updateCabin);
router.delete('/:id',  ADMIN, deleteCabin);

export default router;
