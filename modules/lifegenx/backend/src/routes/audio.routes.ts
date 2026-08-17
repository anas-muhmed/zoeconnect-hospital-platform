import { Router } from 'express';
import { uploadAudio } from '../controllers/audio.controller';
import { uploadAudioMiddleware } from '../middlewares/upload.middleware';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.post('/upload', authenticateJWT, uploadAudioMiddleware.single('audio'), uploadAudio);

export default router;
