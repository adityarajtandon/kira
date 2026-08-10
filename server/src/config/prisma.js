import { PrismaClient } from '@prisma/client';
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.__kiraPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.__kiraPrisma = prisma;

