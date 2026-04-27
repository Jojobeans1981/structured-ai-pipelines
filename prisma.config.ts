import { defineConfig } from '@prisma/config';
import { existsSync, readFileSync } from 'fs';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
