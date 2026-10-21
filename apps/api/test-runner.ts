import process from 'node:process';
import {
  apiEnvironment,
  freePort,
  startTestDatabase,
  type TestDatabase,
  testEnvironment,
} from '@lima-garbage/database/testing';

const SERVER_READY_TIMEOUT_MS = 30_000;
const SERVER_POLL_MS = 100;
const TIMEOUT_MS = process.env.CI === 'true' ? 25_000 : 15_000;

async function waitForServer(healthUrl: string): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: each probe waits for the previous one to fail.
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is not listening yet.
    }
    // biome-ignore lint/performance/noAwaitInLoops: the next probe waits for this delay.
    await Bun.sleep(SERVER_POLL_MS);
  }
  throw new Error(`The API server did not answer ${healthUrl} within ${SERVER_READY_TIMEOUT_MS} ms`);
}

let database: TestDatabase | undefined;
let server: Bun.Subprocess | undefined;
let code: number | undefined;

// Password-reset tests send through this fake Resend endpoint so they never need a live key.
const emailSender = Bun.serve({
  port: 0,
  fetch(request) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/emails') {
      return Response.json({ id: 'test-email-id' });
    }
    return new Response('not found', { status: 404 });
  },
});

try {
  database = await startTestDatabase();
  const port = await freePort();
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...testEnvironment(database.url),
    ...apiEnvironment(port),
    RESEND_BASE_URL: emailSender.url.origin,
  };

  server = Bun.spawn(['bun', 'src/cmd/server.ts'], {
    env,
    stderr: 'inherit',
    stdout: 'inherit',
  });
  await waitForServer(`${env.API_BASE_URL}/health`);

  const tests = Bun.spawn(['bun', 'test', '--sequential', '--timeout', TIMEOUT_MS.toString()], {
    env,
    stderr: 'inherit',
    stdout: 'inherit',
  });
  code = await tests.exited;
} finally {
  server?.kill();
  emailSender.stop(true);
  await database?.stop();
}
process.exit(code ?? 1);
