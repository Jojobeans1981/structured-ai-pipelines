import { PrismaClient } from '@prisma/client';

const DEFAULT_QUERY_TIMEOUT_MS = parseInt(process.env.PRISMA_QUERY_TIMEOUT_MS || '8000', 10);

export class DatabaseUnavailableError extends Error {
  constructor(message = 'Database is unavailable. Check DATABASE_URL or start the local Postgres service, then try again.') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

const mapPrismaError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("Can't reach database server") ||
    message.includes('Connection refused') ||
    message.includes('Timed out fetching a new connection') ||
    message.includes('Server has closed the connection')
  ) {
    return new DatabaseUnavailableError();
  }

  return error instanceof Error ? error : new Error(message);
};

const withQueryTimeout = async <T>(operation: Promise<T>, label: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new DatabaseUnavailableError(
              `Database request timed out after ${DEFAULT_QUERY_TIMEOUT_MS}ms during ${label}. Check DATABASE_URL or start the local Postgres service, then try again.`
            )
          );
        }, DEFAULT_QUERY_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    throw mapPrismaError(error);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const basePrisma = globalForPrisma.prisma ?? new PrismaClient();

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, query, args }) {
        return withQueryTimeout(query(args), `${model}.${operation}`);
      },
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}
