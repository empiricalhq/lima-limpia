import { HTTP_STATUS } from '../config';
import type { SuccessResponse } from '../types';
import type { TestClient } from './client';
import type { Database } from './database';

const PASSWORD = 'tenancy-password-123';
const ONE_HOUR_MS = 3_600_000;

export interface Person {
  id: string;
  email: string;
  headers: Record<string, string>;
}

export interface Municipality {
  organizationId: string;
  center: { lat: number; lng: number };
  owner: Person;
  supervisor: Person;
  driver: Person;
  truckId: string;
  routeId: string;
  assignmentId: string;
}

export interface Fixture {
  a: Municipality;
  b: Municipality;
  citizen: Person;
}

export interface ReportInput {
  type: string;
  description: string;
  lat: number;
  lng: number;
}

export const ids = (rows: Array<{ id: string }>): string[] => rows.map((row) => row.id);

/**
 * Builds municipalities through the public API wherever the API allows it, so a test fails on an
 * assertion rather than on a schema this fixture assumed. Membership is the one direct insert:
 * no route creates a municipality or its first staff, by design.
 */
export class Tenancy {
  private readonly client: TestClient;
  private readonly db: Database;

  constructor(client: TestClient, db: Database) {
    this.client = client;
    this.db = db;
  }

  async createOrganization(name: string, slug: string): Promise<string> {
    const rows = await this.db.query<{ id: string }>(
      'INSERT INTO organization (id, name, slug) VALUES (gen_random_uuid(), $1, $2) RETURNING id',
      [name, slug],
    );
    const id = rows[0]?.id;
    if (!id) {
      throw new Error(`Could not create organization ${slug}`);
    }
    return id;
  }

  async createCitizen(email: string): Promise<Person> {
    const id = await this.signUp(email);
    return { id, email, headers: { Cookie: await this.signIn(email) } };
  }

  async createStaff(organizationId: string, role: string, email: string): Promise<Person> {
    const id = await this.signUp(email);
    await this.addMember(id, organizationId, role);
    return { id, email, headers: { Cookie: await this.activate(await this.signIn(email), organizationId) } };
  }

  async addMember(userId: string, organizationId: string, role: string): Promise<void> {
    await this.db.query(
      'INSERT INTO member (id, "userId", "organizationId", role) VALUES (gen_random_uuid(), $1, $2, $3)',
      [userId, organizationId, role],
    );
  }

  async switchTo(person: Person, organizationId: string): Promise<Person> {
    const cookie = await this.activate(person.headers.Cookie ?? '', organizationId);
    return { ...person, headers: { Cookie: cookie } };
  }

  /** Two municipalities with the same shape, far enough apart that no citizen report can be near both. */
  async createFixture(): Promise<Fixture> {
    const a = await this.createMunicipality('a', { lat: -12.04, lng: -77.04 });
    const b = await this.createMunicipality('b', { lat: -12.12, lng: -77.03 });
    const citizen = await this.createCitizen('citizen@tenancy.test');
    return { a, b, citizen };
  }

  private async createMunicipality(key: string, center: { lat: number; lng: number }): Promise<Municipality> {
    const organizationId = await this.createOrganization(`Municipality ${key}`, `municipality-${key}`);
    const owner = await this.createStaff(organizationId, 'owner', `owner-${key}@tenancy.test`);
    const supervisor = await this.createStaff(organizationId, 'supervisor', `supervisor-${key}@tenancy.test`);
    const driver = await this.createStaff(organizationId, 'driver', `driver-${key}@tenancy.test`);

    const truckId = await this.post(owner, '/admin/trucks', {
      name: `Truck ${key}`,
      license_plate: `PLATE-${key.toUpperCase()}`,
    });
    const routeId = await this.post(owner, '/admin/routes', {
      name: `Route ${key}`,
      start_lat: center.lat,
      start_lng: center.lng,
      estimated_duration_minutes: 90,
      waypoints: [
        { lat: center.lat, lng: center.lng, sequence_order: 1 },
        { lat: center.lat - 0.005, lng: center.lng + 0.005, sequence_order: 2 },
      ],
    });
    const assignmentId = await this.post(owner, '/admin/assignments', {
      route_id: routeId,
      truck_id: truckId,
      driver_id: driver.id,
      scheduled_start_time: new Date(Date.now() - ONE_HOUR_MS).toISOString(),
      scheduled_end_time: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
    });

    await this.expectOk(driver, `/driver/assignments/${assignmentId}/start`, {});
    await this.expectOk(driver, '/driver/location', { lat: center.lat, lng: center.lng, speed: 20, heading: 90 });

    return { organizationId, center, owner, supervisor, driver, truckId, routeId, assignmentId };
  }

  async list<T>(path: string, as: Person): Promise<T[]> {
    const response = await this.client.get<SuccessResponse<T[]>>(path, as.headers);
    if (response.status !== HTTP_STATUS.OK) {
      throw new Error(`GET ${path} as ${as.email} failed with ${response.status}`);
    }
    return response.data.data;
  }

  /** Files a report as `as` and returns nothing: what the caller checks is where the report ends up. */
  async report(as: Person, path: string, report: ReportInput): Promise<void> {
    const { type, description, lat, lng } = report;
    const body = path === '/driver/issues' ? { type, notes: description, lat, lng } : { type, description, lat, lng };
    const response = await this.client.post(path, body, as.headers);
    if (response.status !== HTTP_STATUS.CREATED) {
      throw new Error(`POST ${path} as ${as.email} failed with ${response.status}`);
    }
  }

  private async post(as: Person, path: string, body: unknown): Promise<string> {
    const response = await this.client.post<SuccessResponse<{ id: string }>>(path, body, as.headers);
    if (response.status !== HTTP_STATUS.CREATED || !response.data.data.id) {
      throw new Error(`Fixture request ${path} failed with ${response.status}`);
    }
    return response.data.data.id;
  }

  private async expectOk(as: Person, path: string, body: unknown): Promise<void> {
    const response = await this.client.post(path, body, as.headers);
    if (response.status !== HTTP_STATUS.OK) {
      throw new Error(`Fixture request ${path} failed with ${response.status}`);
    }
  }

  private async signUp(email: string): Promise<string> {
    const response = await this.client.post('/auth/sign-up/email', { email, password: PASSWORD, name: email });
    if (response.status !== HTTP_STATUS.OK) {
      throw new Error(`Sign-up failed for ${email}: ${response.status}`);
    }
    const rows = await this.db.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email]);
    const id = rows[0]?.id;
    if (!id) {
      throw new Error(`No user row for ${email}`);
    }
    return id;
  }

  private async signIn(email: string): Promise<string> {
    const response = await this.client.post('/auth/sign-in/email', { email, password: PASSWORD });
    return firstCookie(response.headers);
  }

  private async activate(cookie: string, organizationId: string): Promise<string> {
    const response = await this.client.post('/auth/organization/set-active', { organizationId }, { Cookie: cookie });
    return response.headers.get('set-cookie') ? firstCookie(response.headers) : cookie;
  }
}

function firstCookie(headers: Headers): string {
  const [cookie] = (headers.get('set-cookie') ?? '').split(';');
  if (!cookie) {
    throw new Error('No session cookie received');
  }
  return cookie;
}
