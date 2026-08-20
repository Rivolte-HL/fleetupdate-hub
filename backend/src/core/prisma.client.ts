import { PrismaClient } from '@prisma/client';

// Global singleton instance of PrismaClient to prevent connection pool exhaustion
export const prisma = new PrismaClient();
