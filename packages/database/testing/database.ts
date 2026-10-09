// biome-ignore-all lint/style/useNamingConvention: names must match environment variables.
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { serve } from './serve.ts';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations');
const HOST = '127.0.0.1';

export interface TestDatabase {
  /** A connection string for `pg`. PGlite ignores the user, password and database name. */
  url: string;
  stop: () => Promise<void>;
}

/**
 * Starts a throwaway in-process Postgres on a free local port with every migration in
 * `packages/database/migrations` applied. Nothing outlives `stop()`.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const db = await PGlite.create();
  await migrate(drizzle(db), { migrationsFolder: MIGRATIONS_DIR });

  const server = await serve(db, HOST);

  return {
    url: `postgresql://postgres:postgres@${HOST}:${server.port}/postgres`,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}

/**
 * Returns the environment for the API server and test process.
 * It replaces caller-provided credentials and database URLs before either process starts.
 * Test helpers read `TEST_DATABASE_URL` to find the database.
 */
export function testEnvironment(databaseUrl: string): Record<string, string> {
  return {
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'http://localhost:4000',
    RESEND_API_KEY: 'test-key',
    EMAIL_FROM: 'test@lima-limpia.pe',
    EMAIL_FROM_NAME: 'Lima Limpia Test',
  };
}
