import { defineConfig } from 'drizzle-kit';
import { mustEnv } from './scripts/env.js';

const databaseUrl = mustEnv('DATABASE_URL');

// biome-ignore lint/style/noDefaultExport: Drizzle Kit requires a default export.
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
