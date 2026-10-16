import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..', '..');
const PLUGIN = join(REPOSITORY_ROOT, 'biome-plugins', 'no-service-database-access.grit');
const BIOME = join(REPOSITORY_ROOT, 'node_modules', '.bin', 'biome');
const MESSAGE = 'Services and handlers do not query the database.';

let project: string;

beforeAll(async () => {
  project = await mkdtemp(join(tmpdir(), 'service-lint-'));
  // Use the root plugin globs in an isolated project so the test controls its inputs.
  await writeFile(
    join(project, 'biome.json'),
    JSON.stringify({
      linter: { enabled: true },
      overrides: [{ includes: ['**/internal/domains/**/service.ts'], plugins: [PLUGIN] }],
    }),
  );
});

afterAll(() => rm(project, { force: true, recursive: true }));

async function lint(path: string, source: string): Promise<string> {
  const file = join(project, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source);
  const result = Bun.spawnSync([BIOME, 'lint', path], {
    cwd: project,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return `${result.stdout}${result.stderr}`;
}

describe.skipIf(!(await Bun.file(BIOME).exists()))('no-service-database-access', () => {
  test('refuses pool.query in a service that imports Pool from pg', async () => {
    const output = await lint(
      'internal/domains/pool/service.ts',
      `import type { Pool } from 'pg';
export class PoolService {
  constructor(private readonly pool: Pool) {}
  list() {
    return this.pool.query('SELECT 1');
  }
}
`,
    );

    expect(output).toContain(MESSAGE);
  });

  test('refuses a transaction handle whatever its name', async () => {
    const output = await lint(
      'internal/domains/transaction/service.ts',
      `import type { DatabaseInterface } from '@/internal/shared/database/database';
export class TransactionService {
  constructor(private readonly connection: DatabaseInterface) {}
  run() {
    return this.connection.withTransaction((tx) => tx.query('SELECT 1'));
  }
}
`,
    );

    expect(output).toContain(MESSAGE);
    expect(output).toContain('Found 2 errors');
  });

  test('refuses db.query without any import', async () => {
    const output = await lint(
      'internal/domains/injected/service.ts',
      `export class InjectedService {
  constructor(private readonly db: { query: (text: string) => Promise<unknown> }) {}
  list() {
    return this.db.query('SELECT 1');
  }
}
`,
    );

    expect(output).toContain(MESSAGE);
  });

  test('refuses a client destructured from a typed dependencies interface', async () => {
    const output = await lint(
      'internal/domains/destructured/service.ts',
      `import type { PoolClient } from 'pg';
interface Dependencies {
  tx: PoolClient;
}
export class DestructuredService {
  constructor({ tx }: Dependencies) {
    tx.query('SELECT 1');
  }
}
`,
    );

    expect(output).toContain(MESSAGE);
  });

  test('allows query and connect on receivers that are not database clients, in a file that imports pg', async () => {
    const output = await lint(
      'internal/domains/unrelated/service.ts',
      `import type { Pool } from 'pg';
import type { Mailer } from './mailer';
export class UnrelatedService {
  constructor(
    private readonly pool: Pool,
    private readonly mailer: Mailer,
    private readonly request: { query: (key: string) => string },
  ) {}
  send() {
    this.mailer.connect();
    return this.request.query('page') + String(this.pool);
  }
}
`,
    );

    expect(output).not.toContain(MESSAGE);
  });

  test('allows a service that calls a repository and reads a request query', async () => {
    const output = await lint(
      'internal/domains/clean/service.ts',
      `import type { Repository } from './repository';
export class CleanService {
  constructor(
    private readonly repository: Repository,
    private readonly request: { query: (key: string) => string },
  ) {}
  list() {
    return this.repository.list(this.request.query('page'));
  }
}
`,
    );

    expect(output).not.toContain(MESSAGE);
  });
});
