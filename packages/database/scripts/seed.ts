import { intro, log, outro, spinner } from '@clack/prompts';
import { createId } from '@paralleldrive/cuid2';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { Pool, type PoolClient } from 'pg';
import color from 'picocolors';
import { mustEnv, optionalEnv } from './env.js';

const MILLISECONDS_PER_MINUTE = 60_000;
const DEFAULT_START_HOUR = 8;

interface AssignmentSeed {
  dbClient: PoolClient;
  truckId: string;
  routeId: string;
  driverId: string;
  supervisorId: string;
  startHour: number;
  durationMinutes: number;
}

const DATABASE_URL = mustEnv('DATABASE_URL');
const AUTH_SECRET = mustEnv('BETTER_AUTH_SECRET');
const ADMIN_EMAIL = mustEnv('SYSTEM_ADMIN_EMAIL');
const ADMIN_PASS = mustEnv('SYSTEM_ADMIN_PASSWORD');

const db = new Pool({ connectionString: DATABASE_URL });
const auth = betterAuth({
  database: db,
  secret: AUTH_SECRET,
  // biome-ignore lint/style/useNamingConvention: Better Auth requires baseURL.
  baseURL: optionalEnv('BETTER_AUTH_URL', 'http://localhost:4000/api'),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      appRole: {
        type: ['admin', 'supervisor', 'driver', 'citizen'],
        required: true,
        defaultValue: 'citizen',
      },
    },
  },
  telemetry: { enabled: false },
  plugins: [admin({ adminRoles: ['admin'] })],
});

const seedUsers = [
  {
    authRole: 'user' as const,
    appRole: 'supervisor' as const,
    name: 'Juan Díaz',
    username: 'juan.supervisor',
    email: 'supervisor@example.com',
  },
  {
    authRole: 'user' as const,
    appRole: 'driver' as const,
    name: 'Luis Martínez',
    username: 'luis.driver',
    email: 'driver@example.com',
  },
  {
    authRole: 'user' as const,
    appRole: 'citizen' as const,
    name: 'María Pérez',
    username: 'maria.citizen',
    email: 'citizen@example.com',
  },
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

async function ensureUser(sessionToken: string, u: (typeof seedUsers)[number]) {
  const { rows } = await db.query('SELECT * FROM "user" WHERE email=$1', [u.email]);
  if (rows.length > 0) {
    return rows[0];
  }

  await auth.api.createUser({
    body: {
      email: u.email,
      password: 'password123',
      name: u.name,
      role: u.authRole,
      data: {
        appRole: u.appRole,
        username: u.username,
      },
    },
    // biome-ignore lint/style/useNamingConvention: HTTP requires the capitalized header name.
    headers: { Cookie: sessionToken },
  });

  const { rows: created } = await db.query('SELECT * FROM "user" WHERE email=$1', [u.email]);
  return created[0];
}

async function ensureTruck(dbClient: PoolClient, t: (typeof seedData.trucks)[number]) {
  const { rows } = await dbClient.query('SELECT id FROM truck WHERE license_plate=$1', [t.licensePlate]);
  if (rows.length > 0) {
    return rows[0].id;
  }
  const id = createId();
  await dbClient.query('INSERT INTO truck (id,name,license_plate) VALUES ($1,$2,$3)', [id, t.name, t.licensePlate]);
  return id;
}

async function ensureRoute(dbClient: PoolClient, supervisorId: string) {
  const { route, waypoints } = seedData;
  const { rows } = await dbClient.query('SELECT id FROM route WHERE name=$1', [route.name]);
  if (rows.length > 0) {
    return rows[0].id;
  }

  const routeId = createId();
  await dbClient.query(
    'INSERT INTO route (id,name,description,start_lat,start_lng,estimated_duration_minutes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [
      routeId,
      route.name,
      route.description,
      route.startLat,
      route.startLng,
      route.estimatedDurationMinutes,
      supervisorId,
    ],
  );

  await Promise.all(
    waypoints.map((wp) =>
      dbClient.query(
        'INSERT INTO route_waypoint (id,route_id,sequence_order,lat,lng,estimated_arrival_offset_minutes,street_name) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [createId(), routeId, wp.order, wp.lat, wp.lng, wp.offset, wp.streetName],
      ),
    ),
  );

  return routeId;
}

async function ensureAssignment({
  dbClient,
  truckId,
  routeId,
  driverId,
  supervisorId,
  startHour,
  durationMinutes,
}: AssignmentSeed) {
  const [today] = new Date().toISOString().split('T');
  const { rows } = await dbClient.query('SELECT id FROM route_assignment WHERE truck_id=$1 AND assigned_date=$2', [
    truckId,
    today,
  ]);
  if (rows.length > 0) {
    return;
  }

  const start = new Date();
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * MILLISECONDS_PER_MINUTE);

  await dbClient.query(
    'INSERT INTO route_assignment (id,route_id,truck_id,driver_id,assigned_date,scheduled_start_time,scheduled_end_time,assigned_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [createId(), routeId, truckId, driverId, today, start, end, supervisorId],
  );
}

async function authenticateAdmin() {
  const s = spinner();
  s.start('Iniciando sesión como administrador...');
  const { headers } = await auth.api.signInEmail({
    returnHeaders: true,
    body: { email: ADMIN_EMAIL, password: ADMIN_PASS },
  });
  const sessionToken = headers.get('set-cookie');
  if (!sessionToken) {
    throw new Error('No session token');
  }
  s.stop('Sesión iniciada.');
  return sessionToken;
}

async function createSeedUsers(sessionToken: string) {
  const s = spinner();
  s.start('Creando usuarios...');
  const userList = await Promise.all(seedUsers.map((u) => ensureUser(sessionToken, u)));
  const users = new Map(userList.map((u) => [u.email, u]));
  s.stop('Usuarios listos.');
  return users;
}

async function seedDatabase(client: PoolClient, supervisor: { id: string }, driver: { id: string }) {
  const s = spinner();

  s.start('Creando camiones...');
  const truckIds = await Promise.all(seedData.trucks.map((t) => ensureTruck(client, t)));
  s.stop('Camiones listos.');

  s.start('Creando ruta y waypoints...');
  const routeId = await ensureRoute(client, supervisor.id);
  s.stop('Ruta lista.');

  s.start('Creando asignaciones...');
  await ensureAssignment({
    dbClient: client,
    truckId: truckIds[0],
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
    const sessionToken = await authenticateAdmin();
    const users = await createSeedUsers(sessionToken);

    const supervisor = users.get('supervisor@example.com');
    const driver = users.get('driver@example.com');

    if (!(supervisor && driver)) {
      throw new Error('El usuario con rol de "supervisor" o "conductor" no pudo ser creado/encontrado.');
    }

    await client.query('BEGIN');
    await seedDatabase(client, supervisor, driver);
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

main();
