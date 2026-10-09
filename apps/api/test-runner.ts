import process from 'node:process';
import { startTestDatabase, testEnvironment } from '@lima-garbage/database/testing';

const SERVER_STARTUP_DELAY_MS = 6000;
const TIMEOUT_MS = process.env.CI === 'true' ? 25_000 : 15_000;

const database = await startTestDatabase();
const env = { ...process.env, ...testEnvironment(database.url) };

const server = Bun.spawn(['bun', 'src/cmd/server.ts'], {
  env,
  stderr: 'inherit',
  stdout: 'inherit',
});

await Bun.sleep(SERVER_STARTUP_DELAY_MS);

const tests = Bun.spawn(['bun', 'test', '--sequential', '--timeout', TIMEOUT_MS.toString()], {
  env,
  stderr: 'inherit',
  stdout: 'inherit',
});

const code = await tests.exited;

try {
  server.kill();
} catch {
  // Cleanup can race with a server that has already exited.
}

await database.stop();
process.exit(code ?? 1);
