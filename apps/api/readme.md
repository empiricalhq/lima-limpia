# API

The API is a Hono application in `apps/api`. Run it locally with Bun:

```sh
bun --filter @lima-garbage/api dev
```

The default base URL is `http://localhost:4000`. Every application route is
under `/api`, so the health check is `GET /api/health`.

## Authentication

Email and password sessions are managed by
[Better Auth](https://www.better-auth.com/docs). A successful sign-in sets the
`better-auth.session_token` cookie. Send that cookie with every protected
request.

Staff requests need an active organization and one of these member roles:

```text
owner  admin  supervisor  driver
```

A municipality is one organization. Staff read and change only the data of their
active organization; a request for another municipality's truck, route,
assignment, or report answers 404. Citizen requests need an authenticated
session without an active organization and see every municipality's active
trucks. The API checks these rules even when a client has already checked them.

Custom API responses wrap successful data in `{ "data": ... }` and errors in
`{ "error": "..." }`. Better Auth routes keep Better Auth's response shape.

## Routes

The following routes are implemented in this application. Request bodies use the
field names shown in the database and API contracts.

### Health

| Method | Path          | Auth | Description                                  |
| ------ | ------------- | ---- | -------------------------------------------- |
| `GET`  | `/api/health` | None | Return API status and the current timestamp. |

### Authentication

Better Auth registers many more routes than these under `/api/auth`, but only
the paths below are mounted (`apps/api/src/internal/domains/auth/handler.ts`).
Every other Better Auth path, including `organization/get-full-organization`,
`organization/get-active-member`, and `organization/update-member-role`, returns
404 before Better Auth's own handler runs — see
[ARCHITECTURE.md](../../ARCHITECTURE.md) for why. Add a new call only by adding
its route to `ALLOWED_ROUTES` and a passing test in
`apps/api/tests/authorization.test.ts` asserting it is mounted.

| Method | Path                                            | Description                                                         |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| `GET`  | `/api/auth/get-session`                         | Return the current user and session.                                |
| `POST` | `/api/auth/sign-in/email`                       | Sign in with `email` and `password`.                                |
| `POST` | `/api/auth/sign-up/email`                       | Create a user with `name`, `email`, and `password`.                 |
| `POST` | `/api/auth/sign-out`                            | End the current session.                                            |
| `POST` | `/api/auth/request-password-reset`              | Request a reset email.                                              |
| `POST` | `/api/auth/reset-password`                      | Set a new password with a reset token.                              |
| `GET`  | `/api/auth/reset-password/:token`               | Validate a reset link and redirect; the link the reset email sends. |
| `GET`  | `/api/auth/organization/get-active-member-role` | Return the current member role.                                     |
| `GET`  | `/api/auth/organization/list`                   | List organizations for the current user.                            |
| `POST` | `/api/auth/organization/set-active`             | Set the active organization with `organizationId`.                  |

### Staff

All `/api/admin` routes require an active organization and the `owner`, `admin`,
or `supervisor` member role.

| Method   | Path                              | Description                                                            |
| -------- | --------------------------------- | ---------------------------------------------------------------------- |
| `GET`    | `/api/admin/drivers`              | List drivers.                                                          |
| `POST`   | `/api/admin/drivers`              | Create a driver with `name`, `email`, and `password`.                  |
| `GET`    | `/api/admin/trucks`               | List active trucks and their current assignment data.                  |
| `POST`   | `/api/admin/trucks`               | Create a truck with `name` and `license_plate`.                        |
| `DELETE` | `/api/admin/trucks/:id`           | Deactivate a truck.                                                    |
| `GET`    | `/api/admin/routes`               | List active routes.                                                    |
| `POST`   | `/api/admin/routes`               | Create a route with coordinates, duration, and at least one waypoint.  |
| `GET`    | `/api/admin/routes/:id/waypoints` | List a route's waypoints.                                              |
| `POST`   | `/api/admin/assignments`          | Assign a route, truck, and driver with start and end timestamps.       |
| `GET`    | `/api/admin/issues`               | List open citizen and driver issues.                                   |
| `POST`   | `/api/admin/issues`               | Create an issue with `type`, coordinates, and an optional description. |

Route creation accepts `start_lat`, `start_lng`, `estimated_duration_minutes`,
and this waypoint shape:

```json
{
  "lat": -12.0464,
  "lng": -77.0428,
  "sequence_order": 1
}
```

Assignment creation accepts `route_id`, `truck_id`, `driver_id`,
`scheduled_start_time`, and `scheduled_end_time`. The server sets
`assigned_date` from the current date.

### Driver

All `/api/driver` routes require the `driver` member role.

| Method | Path                                   | Description                                              |
| ------ | -------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/api/driver/route/current`            | Return the driver's next scheduled or active assignment. |
| `POST` | `/api/driver/assignments/:id/start`    | Start a scheduled assignment.                            |
| `POST` | `/api/driver/assignments/:id/complete` | Complete an active assignment.                           |
| `POST` | `/api/driver/location`                 | Save the current location for the active truck.          |
| `POST` | `/api/driver/issues`                   | Report an issue for the active assignment.               |

Location requests require `lat` and `lng`. `speed` and `heading` are optional.

### Citizen

All `/api/citizen` routes require an authenticated user without an active
organization.

| Method | Path                            | Description                                                           |
| ------ | ------------------------------- | --------------------------------------------------------------------- |
| `GET`  | `/api/citizen/trucks`           | List active trucks with available locations.                          |
| `GET`  | `/api/citizen/truck/status`     | Return the nearest active truck status for the user's saved location. |
| `PUT`  | `/api/citizen/profile/location` | Save the user's `lat` and `lng`.                                      |
| `POST` | `/api/citizen/issues`           | Report a missed collection, illegal dumping, or other issue.          |
| `GET`  | `/api/citizen/issues`           | List the current user's reports.                                      |

Citizen issue requests use `type`, `lat`, and `lng`. `description` and
`photo_url` are optional. Valid types are `missed_collection`,
`illegal_dumping`, and `other`.

A report goes to the municipality whose active route starts or passes within 5
km of the report's coordinates, the nearest one when several are in reach. A
report with no municipality in reach stays unassigned: no staff sees it, and its
author still lists it.

## Errors

The API returns these status codes for its custom routes:

| Status | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| `400`  | The body, path parameter, or referenced resource is invalid.        |
| `401`  | The request has no valid session.                                   |
| `403`  | The session has the wrong role or organization state.               |
| `404`  | The resource does not exist or cannot be used in its current state. |
| `409`  | The request conflicts with an existing database record.             |
| `500`  | An unexpected server error occurred.                                |

## Environment

Copy [`../../.env.example`](../../.env.example) to `.env`. The API requires:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `RESEND_API_KEY`

`BETTER_AUTH_URL`, `PORT`, `CORS_ORIGINS`, `TRUSTED_ORIGINS`, and the email
sender settings have development defaults.

## Deploy

The local server uses Bun. The checked-in Wrangler configuration builds a
Cloudflare Worker:

```sh
bun --filter @lima-garbage/api build:worker
bun --filter @lima-garbage/api deploy
```

Set secrets with Wrangler before deploying:

```sh
cd apps/api
bun x wrangler secret put DATABASE_URL
bun x wrangler secret put BETTER_AUTH_SECRET
bun x wrangler secret put RESEND_API_KEY
```
