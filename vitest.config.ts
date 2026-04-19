import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    // Prisma 7 requires DATABASE_URL to be present in the process env
    env: {
      NODE_ENV: 'test',
    }
  },
});
