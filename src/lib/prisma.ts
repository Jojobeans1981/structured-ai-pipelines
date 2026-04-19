import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 1. Create a standard Postgres connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 2. Wrap it in the Prisma 7 Adapter
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter, // <-- THIS resolves the "requires adapter" error
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
