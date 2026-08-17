import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export const prisma = new PrismaClient();

export async function connectDB() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully via Prisma ORM');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
  }
}
