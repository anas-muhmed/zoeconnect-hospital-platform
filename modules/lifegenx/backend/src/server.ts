import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'path';
import { config } from './config/env';
import { logger } from './config/logger';
import { connectDB } from './config/db';
import { apiRateLimiter } from './middlewares/rateLimiter.middleware';
import { errorHandler } from './middlewares/error.middleware';

import authRoutes from './routes/auth.routes';
import audioRoutes from './routes/audio.routes';
import aiRoutes from './routes/ai.routes';
import consultationRoutes from './routes/consultation.routes';

const app = express();

// Security & Middlewares
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: '*',
    credentials: true
  })
);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(pinoHttp({ logger }));
app.use('/api', apiRateLimiter);

// Serve static uploaded audio files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/consultations', consultationRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'AI Clinical Symptom Extraction & Diagnosis Backend',
    timestamp: new Date().toISOString(),
    env: config.nodeEnv
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = config.port;

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(`🚀 Hospital EMR Clinical Backend Server running on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);
  });
}

startServer();
