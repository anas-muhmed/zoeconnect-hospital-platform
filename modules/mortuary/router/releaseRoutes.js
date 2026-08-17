import { Router } from 'express';
import upload, { safeUpload } from '../config/multer.js';
import {
  createBodyRelease,
  getBodyRelease,
  getReleaseHistory
} from '../controller/releaseController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');

router.use(authenticate);

router.post('/', STAFF, safeUpload(upload.fields([
  { name: 'nocFile', maxCount: 1 },
  { name: 'legalDocumentsFile', maxCount: 1 }
])), createBodyRelease);

router.get('/:bodyId', STAFF, getBodyRelease);

export default router;
