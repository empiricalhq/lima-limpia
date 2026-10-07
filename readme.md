# Lima Limpia

Lima Limpia is a waste-collection system for Peruvian municipalities. Municipal
staff manage trucks, routes, and drivers from a web dashboard. Citizens follow
active trucks and report missed collections from a mobile app. Several
municipalities run on one deployment and each sees only its own data.

An HTTP API in `apps/api` owns authentication, business rules, and every write
to PostgreSQL. The web and mobile apps are clients of that API.

## Install

You need [Bun](https://bun.sh) 1.4 and a PostgreSQL database.

```sh
git clone https://github.com/empiricalhq/lima-limpia.git
cd lima-limpia
cp .env.example .env
bun install
```

Open `.env` and set three values. The template leaves them empty or as
placeholders, and the scripts and the API stop without them:

- `DATABASE_URL`: your PostgreSQL connection string.
- `BETTER_AUTH_SECRET`: a random string. `openssl rand -base64 32` prints one.
- `RESEND_API_KEY`: a [Resend](https://resend.com/api-keys) API key. The API
  sends the password-reset email with it.

Then create the schema, a municipality, and sample data, and start the API:

```sh
bun --filter @lima-garbage/database db:push
bun --filter @lima-garbage/database setup:municipality
bun --filter @lima-garbage/database db:seed
bun --filter @lima-garbage/api dev
```

`setup:municipality` creates a municipality and its first owner. `db:seed` adds
sample trucks, a route, and users to the oldest municipality.
[Setup](docs/setup.md) covers the web dashboard, the citizen app, and the
support account.

## Try it

With the API running, check that it is up:

```sh
curl http://localhost:4000/api/health
```

```json
{ "status": "ok", "timestamp": "2026-10-06T17:21:29.825Z" }
```

Sign in as the seeded citizen. The session cookie goes in a jar and comes back
on the next request:

```sh
curl -c jar -H 'content-type: application/json' \
  -d '{"email":"citizen@example.com","password":"password123"}' \
  http://localhost:4000/api/auth/sign-in/email

curl -b jar http://localhost:4000/api/citizen/trucks
```

The response has one entry per active truck. The first entry is:

```json
{
  "data": [
    {
      "id": "gxiqqhdhbkstsnyafjtty7fw",
      "name": "Recolector Miraflores",
      "license_plate": "MIR-001",
      "is_active": true,
      "created_at": "2026-10-06T17:21:13.108Z",
      "lat": null,
      "lng": null,
      "location_updated_at": null,
      "assignment_status": "scheduled"
    }
  ]
}
```

`lat` and `lng` are `null` until a driver on an active assignment reports a
location. The full route list is in the [API reference](docs/api.md).

## Features

- Multi-municipality tenancy. Every staff query is scoped to one municipality,
  and the database rejects rows that mix two.
- Staff roles `owner`, `admin`, `supervisor`, and `driver`, with permissions per
  route.
- Routes with ordered waypoints, and assignments that pair a route, a truck, and
  a driver.
- Live truck locations from the driver's active assignment.
- Citizen reports of missed collections and illegal dumping, routed to the
  nearest municipality within 5 km.
- A support role that reads every municipality and acts only by impersonating a
  user, with an audit trail.
- Password-reset email rendered from React Email templates.

## Repository

| Path                                     | Contents                                                       |
| ---------------------------------------- | -------------------------------------------------------------- |
| [`apps/api`](apps/api)                   | Hono API: authentication, business rules, database writes.     |
| [`apps/web`](apps/web)                   | Next.js dashboard for municipal staff.                         |
| [`apps/citizen`](apps/citizen)           | Expo app for citizens: trucks, reports, waste-sorting lessons. |
| [`apps/server`](apps/server)             | `json-server` mock with sample trucks and collections.         |
| [`packages/database`](packages/database) | Drizzle schema, migrations, setup and seed scripts.            |
| [`packages/email`](packages/email)       | React Email templates.                                         |
| [`datasets`](datasets)                   | Marimo notebooks on public waste and population data.          |

## Documentation

- [Manual](docs/readme.md): setup, API reference, authentication, tenancy,
  support access, and assignments.
- [Architecture](ARCHITECTURE.md): the code map.
- [Contributing](CONTRIBUTING.md): checks and pull requests.

## Maintainers

- [David Duran](https://github.com/totallynotdavid)
- [Pedro Rojas F](https://github.com/PedroRojasF)
