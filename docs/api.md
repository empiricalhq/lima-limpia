# API reference

The API is a Hono application in [`apps/api`](../apps/api/readme.md). Every
route is under `/api` on `http://localhost:4000` by default. The route table is
in [`app.ts`](../apps/api/src/app.ts).

## Sessions

Email and password sessions come from
[Better Auth](https://www.better-auth.com/docs). A sign-in sets the
`better-auth.session_token` cookie. Send it with every protected request.

A staff session also needs an active municipality. Sign-in does not set one, so
the client calls `organization/set-active` once:

```sh
curl -c jar -H 'content-type: application/json' \
  -d '{"email":"owner@example.com","password":"password123"}' \
  http://localhost:4000/api/auth/sign-in/email

curl -b jar http://localhost:4000/api/auth/organization/list

curl -b jar -c jar -H 'content-type: application/json' \
  -d '{"organizationId":"kan3pf0zypx7n3bwohug3uss"}' \
  http://localhost:4000/api/auth/organization/set-active

curl -b jar http://localhost:4000/api/auth/organization/get-active-member-role
```

```json
{ "role": "owner" }
```

Without an active municipality a staff route answers
`{"error":"No active organization"}`. A citizen never sets one. See
[Authentication](authentication.md) for roles and [Tenancy](tenancy.md) for what
a municipality can see.

## Responses

A successful custom route answers `{ "data": ... }`. A failure answers
`{ "error": "..." }` with the status below. Better Auth routes keep Better
Auth's own shape.

```sh
curl -b jar -H 'content-type: application/json' \
  -d '{"name":"Camión Norte","license_plate":"ABC-123"}' \
  http://localhost:4000/api/admin/trucks
```

```json
{
  "data": {
    "id": "fe869d59-b809-459a-aa43-a8a4779db7d7",
    "name": "Camión Norte",
    "license_plate": "ABC-123",
    "is_active": true,
    "created_at": "2026-10-06T17:21:43.400Z"
  }
}
```

| Status | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| `400`  | The body, path parameter, or referenced resource is invalid.        |
| `401`  | The request has no valid session.                                   |
| `403`  | The session has the wrong role or organization state.               |
| `404`  | The resource does not exist or cannot be used in its current state. |
| `409`  | The request conflicts with an existing database record.             |
| `500`  | An unexpected server error occurred.                                |

A request body that fails its Zod schema answers `400` with
`{ "success": false, "error": { "name": "ZodError", "message": "..." } }`, where
`message` is the JSON-encoded list of issues.

## Health

| Method | Path          | Auth | Description                                  |
| ------ | ------------- | ---- | -------------------------------------------- |
| `GET`  | `/api/health` | None | Return API status and the current timestamp. |

## Authentication

Only the paths below are mounted under `/api/auth`
([`handler.ts`](../apps/api/src/internal/domains/auth/handler.ts)). Any other
path answers `404`. [Authentication](authentication.md) explains the list.

| Method | Path                                            | Description                                                         |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| `GET`  | `/api/auth/get-session`                         | Return the current user and session.                                |
| `POST` | `/api/auth/sign-in/email`                       | Sign in with `email` and `password`.                                |
| `POST` | `/api/auth/sign-up/email`                       | Create a citizen with `name`, `email`, and `password`.              |
| `POST` | `/api/auth/sign-out`                            | End the current session.                                            |
| `POST` | `/api/auth/request-password-reset`              | Request a reset email.                                              |
| `POST` | `/api/auth/reset-password`                      | Set a new password with a reset token.                              |
| `GET`  | `/api/auth/reset-password/:token`               | Validate a reset link and redirect; the link the reset email sends. |
| `GET`  | `/api/auth/organization/get-active-member-role` | Return the current member role.                                     |
| `GET`  | `/api/auth/organization/list`                   | List the organizations the user belongs to.                         |
| `POST` | `/api/auth/organization/set-active`             | Set the active organization with `organizationId`.                  |

`organization/set-active` answers `403` to an impersonated session.

## Staff

Every `/api/admin` route needs an active organization and a role that holds the
permission in the last column. The roles are defined in
[`roles.ts`](../packages/database/src/auth/roles.ts).

| Method   | Path                              | Description                                                      | Roles                    |
| -------- | --------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| `GET`    | `/api/admin/drivers`              | List drivers.                                                    | owner, admin, supervisor |
| `POST`   | `/api/admin/drivers`              | Create a driver with `name`, `email`, and `password`.            | owner, admin, supervisor |
| `GET`    | `/api/admin/supervisors`          | List supervisors.                                                | owner, admin, supervisor |
| `POST`   | `/api/admin/users`                | Create a user with `name`, `email`, `password`, and `role`.      | owner, admin, supervisor |
| `PATCH`  | `/api/admin/users/:id`            | Update `name` and `email`, and optionally `password`.            | owner, admin, supervisor |
| `GET`    | `/api/admin/trucks`               | List active trucks and their current assignment data.            | owner, admin, supervisor |
| `POST`   | `/api/admin/trucks`               | Create a truck with `name` and `license_plate`.                  | owner, admin             |
| `DELETE` | `/api/admin/trucks/:id`           | Deactivate a truck.                                              | owner, admin             |
| `GET`    | `/api/admin/routes`               | List active routes.                                              | owner, admin, supervisor |
| `POST`   | `/api/admin/routes`               | Create a route with coordinates, duration, and waypoints.        | owner, admin, supervisor |
| `GET`    | `/api/admin/routes/:id/waypoints` | List a route's waypoints.                                        | owner, admin, supervisor |
| `POST`   | `/api/admin/assignments`          | Assign a route, truck, and driver with start and end timestamps. | owner, admin, supervisor |
| `GET`    | `/api/admin/issues`               | List open citizen and driver issues.                             | owner, admin, supervisor |
| `POST`   | `/api/admin/issues`               | Create an issue with `type`, coordinates, and a description.     | owner, admin             |

`POST /api/admin/users` accepts the roles `admin`, `supervisor`, and `driver`.
An owner or admin may create any of them. A supervisor may create only a driver.
`PATCH /api/admin/users/:id` never changes a role.

Route creation takes `name`, `start_lat`, `start_lng`,
`estimated_duration_minutes`, an optional `description`, and one to fifty
waypoints:

```json
{
  "lat": -12.0464,
  "lng": -77.0428,
  "sequence_order": 1
}
```

Assignment creation takes `route_id`, `truck_id`, `driver_id`,
`scheduled_start_time`, and `scheduled_end_time`. The server sets
`assigned_date` from the current date. The new assignment starts as `scheduled`;
[Assignments](assignments.md) covers the rest of its life.

## Driver

Every `/api/driver` route needs the `driver` member role.

| Method | Path                                   | Description                                              |
| ------ | -------------------------------------- | -------------------------------------------------------- |
| `GET`  | `/api/driver/route/current`            | Return the driver's next scheduled or active assignment. |
| `POST` | `/api/driver/assignments/:id/start`    | Start a scheduled assignment.                            |
| `POST` | `/api/driver/assignments/:id/complete` | Complete an active assignment.                           |
| `POST` | `/api/driver/location`                 | Save the current location for the active truck.          |
| `POST` | `/api/driver/issues`                   | Report an issue for the active assignment.               |

A location needs `lat` and `lng`. `speed` and `heading` are optional. An issue
takes `type`, `lat`, `lng`, and optional `notes`. The types are
`mechanical_failure`, `road_blocked`, `truck_full`, and `other`.

## Citizen

Every `/api/citizen` route needs an authenticated user with no active
organization.

| Method | Path                            | Description                                                               |
| ------ | ------------------------------- | ------------------------------------------------------------------------- |
| `GET`  | `/api/citizen/trucks`           | List active trucks of every municipality, with a location when they have. |
| `GET`  | `/api/citizen/truck/status`     | Return the nearest active truck status for the user's saved location.     |
| `PUT`  | `/api/citizen/profile/location` | Save the user's `lat` and `lng`.                                          |
| `POST` | `/api/citizen/issues`           | Report a missed collection, illegal dumping, or other issue.              |
| `GET`  | `/api/citizen/issues`           | List the current user's reports.                                          |

A report takes `type`, `lat`, and `lng`, plus an optional `description` and
`photo_url`. The types are `missed_collection`, `illegal_dumping`, and `other`.

A report goes to the municipality whose active route starts or passes within 5
km of its coordinates, the nearest one when several are in reach. With none in
reach it stays unassigned: no staff member sees it, and only its author lists
it.

## Support

[Support access](support.md) describes these routes and the rules around them.
Every route needs the support user's own session, except `stop-impersonating`,
which needs an impersonated one.

| Method | Path                                                | Description                                    |
| ------ | --------------------------------------------------- | ---------------------------------------------- |
| `GET`  | `/api/support/organizations`                        | List the municipalities.                       |
| `GET`  | `/api/support/organizations/:organizationId/trucks` | List a municipality's trucks.                  |
| `GET`  | `/api/support/organizations/:organizationId/routes` | List a municipality's routes.                  |
| `GET`  | `.../routes/:id/waypoints`                          | List a route's waypoints.                      |
| `GET`  | `.../drivers`                                       | List a municipality's drivers.                 |
| `GET`  | `.../supervisors`                                   | List a municipality's supervisors.             |
| `GET`  | `.../members`                                       | List a municipality's members.                 |
| `GET`  | `.../issues`                                        | List a municipality's open issues.             |
| `GET`  | `/api/support/issues/unassigned`                    | List reports no municipality owns.             |
| `GET`  | `/api/support/citizens?email=`                      | Find a user with no membership by exact email. |
| `POST` | `/api/support/impersonate`                          | Start a session as a user.                     |
| `POST` | `/api/support/stop-impersonating`                   | End the impersonated session.                  |
