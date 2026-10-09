import { Pool, type QueryResultRow } from 'pg';

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. Run the tests with `bun run test`, which starts the database.');
  }
  return url;
}

export class Database {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({ connectionString: testDatabaseUrl() });
  }

  async clean(): Promise<void> {
    // clean in dependency order
    const tables = [
      'truck_location_history',
      'truck_current_location',
      'driver_issue_report',
      'citizen_issue_report',
      'route_assignment',
      'route_waypoint',
      'route',
      'truck',
      'citizen_profile',
      'member',
      'organization',
      'session',
      'account',
      '"user"',
    ];

    await this.pool.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query<T>(text, params);
    return result.rows;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
