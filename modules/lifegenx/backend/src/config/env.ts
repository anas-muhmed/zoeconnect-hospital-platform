import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  // Named LIFEGENX_DATABASE_URL, not DATABASE_URL -- this module now runs
  // in the same process as Drug Indenting, which already owns DATABASE_URL
  // for its own (unrelated) Postgres connection. A shared name would mean
  // whichever module's dotenv.config() ran first silently wins for both.
  databaseUrl: process.env.LIFEGENX_DATABASE_URL || 'file:./dev.db',
  jwtSecret: process.env.JWT_SECRET || 'clinical_ai_emr_jwt_secret_key_2026_super_secure',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Named LIFEGENX_GROQ_API_KEY, not GROQ_API_KEY -- Drug Indenting already
  // owns that name for its own Groq usage, and does not have (or need) a
  // real key configured. Keeping these separate, not shared, is intentional.
  groqApiKey: process.env.LIFEGENX_GROQ_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  uploadDir: path.join(__dirname, '../../uploads')
};
