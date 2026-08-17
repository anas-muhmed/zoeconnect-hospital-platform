import { Router } from 'express';
import upload, { safeUpload } from '../config/multer.js';
import {
  getBodyTypes,
  getBodies,
  getBodyById,
  getBodyAllocation,
  createBody,
  updateBody,
  deleteBody,
  getMlcRegistration,
  getConcessionAuthorities,
  createConcessionAuthority,
  deleteConcessionAuthority
} from '../controller/bodyController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { compressImage } from '../config/imageCompress.js';

const DOCUMENT_MAX_DIMENSION = 1600;

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');
const ADMIN = authorize('Admin', 'SuperAdmin');

router.use(authenticate);

// Body types
router.get('/body-types', STAFF, getBodyTypes);

// Concession authorities (discount approval setup — administrative)
router.get('/concession-authorities',        STAFF, getConcessionAuthorities);
router.post('/concession-authorities',       ADMIN, createConcessionAuthority);
router.delete('/concession-authorities/:id', ADMIN, deleteConcessionAuthority);

// MLC registration document
router.get('/mlc-registration/:bodyId', STAFF, getMlcRegistration);

// NOC upload
router.post('/upload/noc', STAFF, safeUpload(upload.single('noc')), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await compressImage(req.file.path, DOCUMENT_MAX_DIMENSION);
    res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
});

// Bodies CRUD
router.get('/',               STAFF, getBodies);
router.get('/:id',            STAFF, getBodyById);
router.get('/:id/allocation', STAFF, getBodyAllocation);
router.post('/',              STAFF, createBody);
router.put('/:id',            STAFF, updateBody);
router.delete('/:id',         ADMIN, deleteBody);

export default router;
