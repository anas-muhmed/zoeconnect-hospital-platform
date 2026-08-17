import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import upload, { safeUpload } from '../config/multer.js';
import { uploadMultiple, uploadSingle, uploadNoc, listUploads } from '../controller/uploadController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const uploadDir  = path.join(__dirname, '..', 'uploads');

const router = Router();
const STAFF = authorize('M Staff', 'House Keeping', 'Admin', 'SuperAdmin');
const ADMIN = authorize('Admin', 'SuperAdmin');

router.use(authenticate);

router.post('/',        STAFF, safeUpload(upload.array('files', 10)), uploadMultiple);
router.post('/single',  STAFF, safeUpload(upload.single('file')),     uploadSingle);
// Body Registration's NOC certificate field (MLC and Non-MLC both use it) --
// the frontend has always posted here, but no route ever answered it, and
// uploadNoc existed in the controller unwired to anything. 404 on every
// attempt, which is what "cannot upload any images" was.
router.post('/noc',     STAFF, safeUpload(upload.single('noc')),      uploadNoc);
router.get('/',         ADMIN, listUploads);

// Serves back a previously uploaded file (NOC certificates, body-release
// documents, etc.) -- every upload endpoint above has always returned a
// `/uploads/<filename>` path, but nothing ever served that path back.
// path.basename strips any directory component a malicious filename param
// could smuggle in, so this can only ever resolve to a file directly inside
// uploadDir, never traverse to a parent directory.
router.get('/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename);
  res.sendFile(path.join(uploadDir, safeName), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File not found.' });
  });
});

export default router;
