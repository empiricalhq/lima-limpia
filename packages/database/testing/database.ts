// biome-ignore-all lint/style/useNamingConvention: names must match environment variables.
import { createServer } from 'node:net';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { serve } from './serve.ts';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations');
const HOST = '127.0.0.1';
const WEB_ORIGIN = 'http://localhost:3000';

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

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      probe.close(() => (port ? resolve(port) : reject(new Error('The OS gave no free port'))));
    });
  });
}

/**
 * Returns the environment that makes the API server and tests use `port`, so
 * simultaneous runs do not share a port. Merge it over `testEnvironment`.
 */
export function apiEnvironment(port: number): Record<string, string> {
  const origin = `http://localhost:${port}`;
  return {
    PORT: String(port),
    API_BASE_URL: `${origin}/api`,
    BETTER_AUTH_URL: origin,
    TRUSTED_ORIGINS: `${WEB_ORIGIN},${origin}`,
    CORS_ORIGINS: `${WEB_ORIGIN},${origin}`,
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
