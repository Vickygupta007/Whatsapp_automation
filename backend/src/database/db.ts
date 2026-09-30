import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

let prisma: PrismaClient | null = null;
let isDbConnected = false;
let hasAttemptedConnect = false;

export async function getPrismaClient(): Promise<PrismaClient | null> {
  if (hasAttemptedConnect) {
    return isDbConnected ? prisma : null;
  }
  hasAttemptedConnect = true;

  // In test environment or when DATABASE_URL is absent, use in-memory fallback
  if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
    prisma = null;
    isDbConnected = false;
    logger.debug('[DB] Using in-memory repository store.');
    return null;
  }

  try {
    const client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    await Promise.race([
      client.$connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timeout (2s)')), 2000)
      ),
    ]);

    prisma = client;
    isDbConnected = true;
    logger.info('Connected to PostgreSQL via Prisma');
    return prisma;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`PostgreSQL not connected (${errorMsg}). Running in-memory repository fallback.`);
    if (prisma) {
      try {
        await (prisma as PrismaClient).$disconnect();
      } catch {
        // ignore
      }
    }
    prisma = null;
    isDbConnected = false;
    return null;
  }
}

export function isConnectedToDatabase(): boolean {
  return isDbConnected;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect().catch(() => {});
    prisma = null;
    isDbConnected = false;
  }
}
