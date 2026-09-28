import { intro, log, outro, spinner } from '@clack/prompts';
import { createId } from '@paralleldrive/cuid2';
import { Pool, type PoolClient } from 'pg';
import color from 'picocolors';
import { type AppRole, createAppAuth, ensureStaffUser } from '../src/auth/index.ts';
import { mustEnv, optionalEnv } from './env.js';

const MILLISECONDS_PER_MINUTE = 60_000;
const DEFAULT_START_HOUR = 8;

interface AssignmentSeed {
  dbClient: PoolClient;
  organizationId: string;
  truckId: string;
  routeId: string;
  driverId: string;
  supervisorId: string;
  startHour: number;
  durationMinutes: number;
}

const DATABASE_URL = mustEnv('DATABASE_URL');
const AUTH_SECRET = mustEnv('BETTER_AUTH_SECRET');

export const db = new Pool({ connectionString: DATABASE_URL });

export const auth = createAppAuth({
  pool: db,
  secret: AUTH_SECRET,
  baseURL: optionalEnv('BETTER_AUTH_URL', 'http://localhost:4000/api'),
});

const seedUsers: Array<{ role: AppRole; name: string; email: string }> = [
  { role: 'supervisor', name: 'Juan Díaz', email: 'supervisor@example.com' },
  { role: 'driver', name: 'Luis Martínez', email: 'driver@example.com' },
  { role: 'citizen', name: 'María Pérez', email: 'citizen@example.com' },
];

const seedData = {
  trucks: [
    { name: 'Recolector Miraflores', licensePlate: 'MIR-001' },
    { name: 'Recolector San Isidro', licensePlate: 'SID-002' },
  ],
  route: {
    name: 'Ruta Centro Lima',
    description: 'Ruta de recolección para el Centro Histórico de Lima.',
    startLat: -12.046_374,
    startLng: -77.042_793,
    estimatedDurationMinutes: 180,
  },
  waypoints: [
    { lat: -12.046_374, lng: -77.042_793, streetName: 'Plaza de Armas', order: 1, offset: 0 },
    { lat: -12.047_196, lng: -77.030_983, streetName: 'Jr. de la Unión', order: 2, offset: 30 },
    { lat: -12.043_333, lng: -77.028_056, streetName: 'Mercado Central', order: 3, offset: 60 },
    { lat: -12.056_944, lng: -77.035_278, streetName: 'Av. Abancay', order: 4, offset: 90 },
    { lat: -12.068_611, lng: -77.036_111, streetName: 'Cercado de Lima', order: 5, offset: 120 },
  ],
};

/**
 * The seed fills the oldest municipality: every non-citizen seed user joins it and every seeded
 * truck, route and assignment belongs to it. A citizen never has one, same as a self-registered citizen.
 */
export async function getOrganizationId(): Promise<string> {
  const { rows } = await db.query('SELECT id FROM organization ORDER BY "createdAt", id LIMIT 1');
  const organizationId = rows[0]?.id;
  if (!organizationId) {
    throw new Error('No existe ninguna municipalidad. Ejecuta "setup:municipality" antes de sembrar datos.');
  }
  return organizationId;
}

export function ensureUser(organizationId: string, u: (typeof seedUsers)[number]) {
  return ensureStaffUser(
    auth,
    db,
    u.role === 'citizen'
      ? { name: u.name, email: u.email, password: 'password123', role: 'citizen' }
      : { name: u.name, email: u.email, password: 'password123', role: u.role, organizationId },
  );
}

async function ensureTruck(dbClient: PoolClient, organizationId: string, t: (typeof seedData.trucks)[number]) {
  const { rows } = await dbClient.query('SELECT id FROM truck WHERE organization_id=$1 AND license_plate=$2', [
    organizationId,
    t.licensePlate,
  ]);
  if (rows.length > 0) {
    return rows[0].id;
  }
  const id = createId();
  await dbClient.query('INSERT INTO truck (id,organization_id,name,license_plate) VALUES ($1,$2,$3,$4)', [
    id,
    organizationId,
    t.name,
    t.licensePlate,
  ]);
  return id;
}

async function ensureRoute(dbClient: PoolClient, organizationId: string, supervisorId: string) {
  const { route, waypoints } = seedData;
  const { rows } = await dbClient.query('SELECT id FROM route WHERE organization_id=$1 AND name=$2', [
    organizationId,
    route.name,
  ]);
  if (rows.length > 0) {
    return rows[0].id;
  }

  const routeId = createId();
  await dbClient.query(
    'INSERT INTO route (id,organization_id,name,description,start_lat,start_lng,estimated_duration_minutes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      routeId,
      organizationId,
      route.name,
      route.description,
      route.startLat,
      route.startLng,
      route.estimatedDurationMinutes,
      supervisorId,
    ],
  );

  await dbClient.query(
    `INSERT INTO route_waypoint (id,organization_id,route_id,sequence_order,lat,lng,estimated_arrival_offset_minutes,street_name)
     SELECT * FROM UNNEST($1::text[],$2::text[],$3::text[],$4::int[],$5::float8[],$6::float8[],$7::int[],$8::text[])`,
    [
      waypoints.map(() => createId()),
      waypoints.map(() => organizationId),
      waypoints.map(() => routeId),
      waypoints.map((wp) => wp.order),
      waypoints.map((wp) => wp.lat),
      waypoints.map((wp) => wp.lng),
      waypoints.map((wp) => wp.offset),
      waypoints.map((wp) => wp.streetName),
    ],
  );

  return routeId;
}

async function ensureAssignment({
  dbClient,
  organizationId,
  truckId,
  routeId,
  driverId,
  supervisorId,
  startHour,
  durationMinutes,
}: AssignmentSeed) {
  const [today] = new Date().toISOString().split('T');
  const { rows } = await dbClient.query(
    'SELECT id FROM route_assignment WHERE organization_id=$1 AND truck_id=$2 AND assigned_date=$3',
    [organizationId, truckId, today],
  );
  if (rows.length > 0) {
    return;
  }

  const start = new Date();
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * MILLISECONDS_PER_MINUTE);

  await dbClient.query(
    'INSERT INTO route_assignment (id,organization_id,route_id,truck_id,driver_id,assigned_date,scheduled_start_time,scheduled_end_time,assigned_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [createId(), organizationId, routeId, truckId, driverId, today, start, end, supervisorId],
  );
}

async function createSeedUsers(organizationId: string) {
  const s = spinner();
  s.start('Creando usuarios...');
  const userList = await Promise.all(seedUsers.map((u) => ensureUser(organizationId, u)));
  const users = new Map(userList.map((u) => [u.email, u]));
  s.stop('Usuarios listos.');
  return users;
}

async function seedDatabase(
  client: PoolClient,
  organizationId: string,
  supervisor: { id: string },
  driver: { id: string },
) {
  const s = spinner();

  s.start('Creando camiones...');
  const truckIds: string[] = [];
  for (const t of seedData.trucks) {
    // biome-ignore lint/performance/noAwaitInLoops: ensureTruck runs on the shared transaction client, so these must not run concurrently.
    truckIds.push(await ensureTruck(client, organizationId, t));
  }
  s.stop('Camiones listos.');

  s.start('Creando ruta y waypoints...');
  const routeId = await ensureRoute(client, organizationId, supervisor.id);
  s.stop('Ruta lista.');

  s.start('Creando asignaciones...');
  await ensureAssignment({
    dbClient: client,
    organizationId,
    // biome-ignore lint/style/noNonNullAssertion: seedData.trucks is a fixed, non-empty literal.
    truckId: truckIds[0]!,
    routeId,
    driverId: driver.id,
    supervisorId: supervisor.id,
    startHour: DEFAULT_START_HOUR,
    durationMinutes: seedData.route.estimatedDurationMinutes,
  });
  s.stop('Asignaciones listas.');
}

async function main() {
  intro(color.inverse('Seeding sample data...'));

  const client = await db.connect();

  try {
    const organizationId = await getOrganizationId();
    const users = await createSeedUsers(organizationId);

    const supervisor = users.get('supervisor@example.com');
    const driver = users.get('driver@example.com');

    if (!(supervisor && driver)) {
      throw new Error('El usuario con rol de "supervisor" o "conductor" no pudo ser creado/encontrado.');
    }

    await client.query('BEGIN');
    await seedDatabase(client, organizationId, supervisor, driver);
    await client.query('COMMIT');

    outro(color.green('Datos de ejemplo añadidos correctamente.'));
  } catch (error: unknown) {
    await client.query('ROLLBACK');

    if (error instanceof Error) {
      log.error(error.message);
    } else {
      log.error(String(error));
    }

    process.exit(1);
  } finally {
    client.release();
    await db.end();
  }
}

if (import.meta.main) {
  main();
}
