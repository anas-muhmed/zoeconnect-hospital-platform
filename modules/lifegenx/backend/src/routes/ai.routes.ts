import { Router } from 'express';
import { handleTranscribeAudio, handleExtractSymptoms, handleGenerateDiagnosis, handleZoiBot } from '../controllers/ai.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.post('/transcribe', authenticateJWT, handleTranscribeAudio);
router.post('/extract', authenticateJWT, handleExtractSymptoms);
router.post('/diagnosis', authenticateJWT, handleGenerateDiagnosis);
router.post('/zoibot', authenticateJWT, handleZoiBot);

export default router;
