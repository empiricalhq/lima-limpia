# Architecture

Lima Limpia has one data owner: `apps/api`. The clients render screens and send
HTTP requests. They do not write to PostgreSQL.

## Runtime flow

```mermaid
flowchart LR
    citizen[Citizen app] --> api[apps/api]
    web[Web dashboard] --> api
    api --> postgres[(PostgreSQL)]
    api --> email[packages/email]
    database[packages/database<br/>schema and migrations] -. applied by tooling .-> postgres
```

- `apps/api` runs the Hono application and owns authentication, authorization,
  validation, business rules, and persistence.
- `apps/web` is a Next.js dashboard. Its server actions call the API and pass
  the session cookie through to it.
- `apps/citizen` is an Expo client. It calls the API from the device and stores
  the local session hint in Expo Secure Store.
- `packages/database` defines the schema and migration files. The API currently
  creates its own `pg` pool and runs parameterized SQL.
- `packages/email` renders the password reset email.

`apps/server` is a standalone `json-server` prototype. It is not connected to
the API or the production database.

## API structure

The API uses a small layered structure under `apps/api/src/internal`:

```text
domains/<name>/
  handler.ts       HTTP routes and request parsing
  service.ts       business rules and failure decisions
  repository.ts    database access
  queries.ts       parameterized SQL
  schemas.ts       Zod request schemas
  models.ts        TypeScript types
```

Not every domain has every file. `admin`, `auth`, `citizen`, `driver`, `health`,
and `support` expose handlers. `trucks`, `routes`, `assignments`, `issues`, and
`locations` provide data used by those handlers.

The container in `internal/container/container.ts` is the composition root. It
creates the database, repositories, services, middleware, and handlers. Register
new dependencies there.

Repositories run parameterized SQL through `pg`. Drizzle is used for schema
definition and migrations, not for API query building. Use
`Database.withTransaction` when related writes must succeed or fail together.

## Authentication and roles

Better Auth manages email/password sessions and organization membership. Clients
send the session cookie with protected requests.

There are two role concepts:

- `user.role` is Better Auth's global role, stored on the `user` table. It is
  not the source of staff access checks. It is where the platform `support` role
  lives (see Platform support).
- `member.role` is the role in the active organization, stored on the `member`
  table (one row per user per organization). Staff routes, and the web
  dashboard's own access checks, read this value. The current roles are `owner`,
  `admin`, `supervisor`, and `driver`.

### Tenancy

One organization is one municipality. Several run on one deployment, each
isolated from the others. Every fact that decides who sees what has one place
and one actor that may change it:

| Fact                                     | Stored in                      | Changed by                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A municipality                           | `organization` row             | The operator, with `setup:municipality`. Nothing over HTTP creates one.                                                                                                                                                            |
| A staff member's role in a municipality  | `member.role`                  | An owner or admin of that municipality, or a supervisor for drivers, through `POST /api/admin/users` and `canManageRole`. The first owner is written by `setup:municipality`. No route changes it afterwards.                      |
| The global role                          | `user.role`                    | A staff role by `POST /api/admin/users`, together with `member.role`, and `owner` by `setup:municipality`. `citizen` by sign-up. `support` by `setup:support`. Not read for staff checks.                                          |
| The municipality a session works in      | `session.activeOrganizationId` | The user, through `organization/set-active`, and only among their own memberships. An impersonated session cannot call it.                                                                                                         |
| The municipality a domain row belongs to | `organization_id` on the row   | The API, from the caller's scope. No request body carries it.                                                                                                                                                                      |
| The platform support role                | `user.role = 'support'`        | The operator, with `setup:support` to grant and `setup:support --revoke` to revoke. No HTTP route writes it.                                                                                                                       |
| An impersonation                         | `session.impersonatedBy`       | A support user starts and stops it through `/api/support`. It ends by itself 15 minutes after it began. Its audit rows are in `support_audit`, which is never deleted from and only has `status_code` set after a write completes. |

Ten domain tables carry a required `organization_id`: `truck`, `route`,
`route_waypoint`, `route_schedule`, `route_assignment`, `driver_issue_report`,
`system_alert`, `dispatch_message`, `truck_current_location` and
`truck_location_history`. Where a row references another tenant row (an
assignment's route, truck, and driver; a location's or an alert's assignment; an
alert's truck), the foreign key includes `organization_id`, so the database
rejects a row that mixes two municipalities. A composite `SET NULL` would also
null `organization_id`, so an assignment or truck that an alert or a current
location references cannot be deleted; the API deactivates trucks instead.
`citizen_issue_report.organization_id` is nullable: `NULL` means no municipality
is in reach of the report.

Citizens are global. A citizen has no membership, keeps one account when they
move, and sees the active trucks and live locations of every municipality
through the citizen routes, which take an `allOrganizations` scope. A citizen
report goes to the municipality of the nearest active route (its start or any
waypoint) within 5 km of the report's coordinates; with none in reach it stays
unassigned, and only its author lists it.

Scoping is a type, not a habit. Staff middleware checks the active-organization
membership and puts an `OrganizationScope` on the request. Every repository
method of a tenant table takes a scope as its first argument, and repositories
extend `TenantRepository` (`apps/api/src/internal/shared/tenancy`), which has no
raw query method. A query is built with `tenantQuery`, which refuses SQL that
has no `{{scope:alias}}` or `{{organization_id}}` marker, and the marker is
replaced with `alias.organization_id = $n` at execution. A read may run under
`allOrganizations`; a write accepts only an organization or the unassigned
scope, so no statement can write into every municipality. A lint rule
(`biome-plugins/no-service-database-access.grit`) rejects `db.query` in services
and handlers, so SQL cannot bypass the repositories. A row outside the caller's
scope reads as missing: 404 for a single resource, an empty list for a
collection.

A role name alone never grants access to another municipality's data: owning any
organization authorizes only that organization.

No staff account reads more than one municipality. The only cross-municipality
reads are the citizens' view of active trucks and the platform support role's
`/api/support` routes (see Platform support).

Migration `0007_organization_tenancy` assigns existing rows to the only
organization. It aborts, and changes nothing, when rows exist and the database
holds anything other than exactly one organization, because it cannot guess
which municipality owns them. An empty database applies with any number.

Better Auth's `organization` and `admin` plugins mount their own endpoints under
`/api/auth/*`, each with its own permission check independent of this app's
`/api/admin/*` routes and `canManageRole`. Both plugins share this app's
access-control statements (`packages/database/src/auth/roles.ts`), which also
back `requirePermission` for the app's own admin routes — so a statement added
for route-level gating (e.g. `user: ['create']`, needed so a supervisor can call
`POST /api/admin/users`) also, unless guarded, authorizes the plugin's own raw
HTTP endpoint for the same resource, with no equivalent to `canManageRole`'s
hierarchy. Worse, Better Auth grants an organization's creator (`owner`, the
plugin's `creatorRole` default) every permission on member-role endpoints
regardless of `roles`/`ac` at all (`allowCreatorAllPermissions`, on by default
in the `organization` plugin's `update-member-role`): an owner could call it and
promote any member, including to owner, no matter how `roles` was configured.
Access-control statements cannot close that off, so closing each dangerous
endpoint's `ac` grant one at a time is a dead end.

`apps/api/src/internal/domains/auth/handler.ts` instead mounts only the
`/api/auth/*` paths this app's own clients (`apps/web`, `apps/citizen`) call:
`get-session`, `sign-in/email`, `sign-up/email`, `sign-out`,
`request-password-reset`, `reset-password`, the `GET reset-password/:token` link
Better Auth's own password-reset email sends,
`organization/get-active-member-role`, `organization/list`, and
`organization/set-active`, which answers 403 to an impersonated session. Every
other endpoint either plugin registers — `organization/create`,
`update-member-role`, `invite-member`, `accept-invitation`,
`get-full-organization`, and the `admin` plugin's own `set-role`, `create-user`,
`ban-user`, `impersonate-user`, `remove-user`, and `set-user-password` — returns
404 before Better Auth's handler ever runs, so no caller can reach them with
their own session regardless of role or plugin permission configuration.

This allowlist is exactly the set of `{method, path}` pairs `apps/web` and
`apps/citizen` call today, not a broader guess at what Better Auth documents. A
new call site means adding its route to `ALLOWED_ROUTES` in `handler.ts` and a
passing test in `apps/api/tests/authorization.test.ts` asserting it is mounted —
not widening the allowlist ahead of an actual caller.

Two plugin options are also still set, as defense in depth in case the allowlist
above is ever loosened or a future feature calls one of these endpoints
programmatically with a real user session (today nothing does; the one caller
that legitimately creates organizations and members,
`AdminService.createOrganizationUser`, does so through different, server-only
APIs — see below):

- `allowUserToCreateOrganization: false` on the `organization` plugin, so even a
  reachable `organization/create` could not let an authenticated user create a
  municipality. Only the operator does, with `setup:municipality`.
- A separate role set (`platformAdminPluginRoles` in `roles.ts`) passed to the
  `admin` plugin only. Every municipality role has an empty set in it, and only
  `support` grants anything (`user: ['impersonate']`). `appPluginRoles` still
  backs `requirePermission` and the `organization` plugin, and grants no `ban`,
  `impersonate`, `delete`, or `set-password`, which nothing in the API calls.

`AdminService.createOrganizationUser` (called from `createUser` and
`createDriver` in `apps/api/src/internal/domains/admin/service.ts`, through the
shared `createStaffUser`/`ensureStaffUser` in `@lima-garbage/database`) is the
only _request_-reachable writer of `member.role`, and the only request-reachable
writer of `user.role` to anything other than the default. `user.role` comes from
Better Auth's own `createUser` (the `admin` plugin), called directly
(`this.authService.api.createUser`, not `fetch`), bypassing the HTTP handler
(and its allowlist) entirely, with no session headers, so it runs as Better
Auth's own "system action"; the endpoint does have an HTTP path
(`/api/auth/admin/create-user`), closed above by the handler's allowlist, so no
caller can reach it with their own session. `member.role` is then written
directly — a parameterized `INSERT INTO member` (`insertMember` in
`packages/database/src/auth/create-staff-user.ts`), not Better Auth's
`addMember` — because `ensureStaffUser`'s repair path must write a repaired
`member.role` and a repaired `user.role` together or not at all, and `addMember`
runs on Better Auth's own connection, which cannot join a transaction this
package holds open on the shared `pg.Pool` (`withTransaction` in
`packages/database/src/auth/transaction.ts`). A unique constraint on
`member (userId, organizationId)` keeps that insert from creating a second
membership for the same user in the same organization, and an index on
`member (organizationId)` keeps lookups by organization indexed. A failed member
write still deletes the user Better Auth just created, so `createStaffUser`
never leaves one behind without a membership. `canManageRole` in
`packages/database/src/auth/roles.ts` limits which role an actor may assign this
way: an owner or admin may create an admin, supervisor, or driver; a supervisor
may only create a driver. `updateUser` cannot change either role —
`UpdateUserSchema` has no `role` field, and the service only rewrites name,
email, and password. It still calls `canManageRole`, but there against the
target's existing role, to gate who may edit that account, not to authorize a
role change.

The public `POST /api/auth/sign-up/email` endpoint also writes `user.role`, to
the `admin` plugin's `defaultRole` (`'citizen'`, set in
`apps/api/src/internal/domains/auth/service.ts`): the plugin registers a
`databaseHooks.user.create.before` hook that runs for every user creation,
including this one, and sets `role: defaultRole` unless the caller already
supplied one. A self-registered citizen never has an active organization, so
this write does not interact with `member.role` or staff access at all — it only
affects what `user.role` (not read for staff checks) holds for that account.

`packages/database/scripts/create-municipality.ts` (`setup:municipality`) is the
one other writer of `member.role`. It creates a municipality and its first
owner, and the operator runs it once per municipality. It uses the same shared
`createAppAuth` instance as the API and the seed script
(`packages/database/src/auth/create-auth.ts`), calling `createUser` for the
owner's `user.role = 'owner'`, then writing the organization and its owner
membership itself — a parameterized `INSERT INTO organization` followed by
`insertMember` with `role: 'owner'`, in one `withTransaction` on the shared pool
— instead of Better Auth's `createOrganization`, for the same reason
`createOrganizationUser` above does not use `addMember`: the organization row
and its owner membership must land together or not at all, and Better Auth's own
connection cannot join that transaction. This is the bootstrap write of
`member.role = 'owner'` for the organization's first member — every later
`member.role` write for a real member goes through `createOrganizationUser`
above. `setup:municipality` is a local script invoked directly
(`bun run scripts/create-municipality.ts`), not reachable over HTTP, so it does
not reintroduce the escalation above.

`packages/database/scripts/seed.ts` (`db:seed`) is a third writer, but a
dev-only one: it calls `ensureStaffUser`, the same shared step
`create-municipality.ts` uses for `insertMember`, to add its fixture staff users
to the oldest municipality and gives that municipality its fixture trucks,
route, and assignment. It is a local script, not reachable over HTTP, and its
fixture data (see `readme.md`) is not meant for production use.

Citizens are authenticated users without an active organization. The citizen
middleware rejects a session that has an active organization, and a session
whose user has the `support` role, which has no organization either. Staff
middleware requires an active organization, a membership in it, and an allowed
member role.

The web app checks access in its middleware and server actions by fetching
`/api/auth/organization/get-active-member-role` for the current session cookie,
never by reading `user.role` from the session. The API checks it again from the
same membership table. The client check improves navigation; the API check is
the security boundary.

That lookup can fail independently of whether the user has a role (a 5xx, a
connection error) and must not be read as "no role": the web app's own checks
(`apps/web/src/proxy.ts`, `apps/web/src/features/auth/lib.ts`,
`apps/web/src/features/auth/actions.ts`) fail the request instead, without
signing the user out.

```mermaid
flowchart TD
    request[Protected request] --> apiAuth[API auth middleware]
    apiAuth --> impersonated{Impersonated session?}
    impersonated -->|"older than 15 minutes, or impersonator no longer support"| refused[401]
    impersonated -->|"yes, otherwise"| audit[Audit row before every write]
    impersonated -->|no| organization
    audit --> organization{Active organization?}
    organization -->|yes| staff[Staff route<br/>member.role check]
    organization -->|no| citizen[Citizen route]
    staff --> scope[OrganizationScope of the active organization]
    citizen --> global[allOrganizations for trucks<br/>unassigned or nearest municipality for reports]
    apiAuth --> supportRoute[Support route<br/>own session, user.role support]
    supportRoute --> supportScope[OrganizationScope named in the URL<br/>or the unassigned scope, reads only]
    scope --> rules[Business rules and database]
    global --> rules
    supportScope --> rules
    webCheck[Web access checks] -. navigation only .-> request
```

### Platform support

The platform support team reads every municipality's data and tickets and
changes anything only by impersonating a user. The role is `support`, stored in
`user.role`. It is not an `AppRole`, `member_role_enum` cannot hold it, and a
support account has no membership, so no staff check in any municipality passes
for it. Support accounts are dedicated: `setup:support` refuses an email that
already has an account, so a municipality user is never promoted.

Only the operator changes the role. `setup:support` grants it, and
`setup:support --revoke <email>` demotes the account to `citizen` and deletes
its sessions. No HTTP route writes it: `POST /api/admin/users` accepts only
`admin`, `supervisor`, and `driver`, `UpdateUserSchema` has no role, sign-up
writes the `citizen` default, and the admin plugin's `set-role` and
`create-user` are not mounted. A municipality owner or admin therefore can
neither grant `support` nor impersonate.

In the admin plugin's role set (`platformAdminPluginRoles`), `support` grants
only `user: ['impersonate']`. The set lists every municipality role with no
grants, because the plugin's `createUser` rejects a role missing from it.
`adminRoles` is `['support']`, so the plugin also demands `impersonate-admins`
to impersonate a support user, which no role has. The plugin's own
`impersonate-user` and `stop-impersonating` endpoints stay unmounted: the app's
routes below wrap them.

**Reading.** `/api/support` is the support team's read surface. Every route on
it is a GET except `POST /impersonate` and `POST /stop-impersonating`, and it
must stay that way. Reads are not audited, so a GET handler must never call a
repository write: that write would carry no audit row and no impersonator. The
municipality reads (`/organizations/:organizationId/trucks`, `routes`,
`routes/:id/waypoints`, `drivers`, `supervisors`, `members`, `issues`) call the
admin service under an `organizationScope` built from the URL, after a check
that the organization exists, so an unknown one is a 404. `/issues/unassigned`
reads the reports no municipality owns under the unassigned scope, and
`/citizens` finds a user with no membership by exact email, so support can find
a citizen to impersonate. `/organizations` lists the municipalities. No route
uses `allOrganizations`. The support middleware reads the role from the database
on every request, so a revoked support user loses access at once.

**Impersonating.** `POST /api/support/impersonate` with
`{ userId, organizationId? }` starts a session as any user who is not a support
user and not banned; citizens are included. A support user cannot be
impersonated, and an impersonated session cannot start another impersonation.
The session opens in one municipality, so the ordinary staff middleware scopes
it exactly as it scopes the user: the user's only municipality, or
`organizationId` for a user in several, which must be one of their memberships.
A citizen's session has none. The start and the session's municipality are
written in one transaction, and a failure deletes the new session. The session
stays in that municipality: the `impersonation.start` row records it, and the
middleware answers 401 to a request whose `activeOrganizationId` differs from
the recorded one. `organization/set-active` answers 403 to an impersonated
session.

An impersonated session is in one of these states, and only these actors move
it:

| State    | Entered when                                                         | Effect                                                                                                 |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Active   | A support user calls `POST /api/support/impersonate`                 | The session acts as the impersonated user.                                                             |
| Stopped  | The session calls `POST /api/support/stop-impersonating`             | Final. The session row is deleted and the support user's own session cookie returns.                   |
| Expired  | 15 minutes pass from `session.createdAt`; the middleware notices     | Final. The middleware answers 401, whatever `expiresAt` says.                                          |
| Disowned | The operator revokes the impersonator's role; the middleware notices | Final. The middleware answers 401, and the revoke has already deleted the impersonator's own sessions. |

The 15 minutes are counted from `createdAt`, which never moves, and are never
renewed. Better Auth extends `expiresAt` on use for a client that omits its
`dont_remember` cookie, so `expiresAt` alone would not bound the session.

An impersonated session may do what the impersonated user may do, with one
exception: it cannot change a login. `AdminService.updateUser` answers 403, and
leaves an audit row, when the request carries a password or a different email,
so an impersonator cannot take over an account's login. Creating users, renaming
them, and every other staff action stay allowed, and audited.

**Audit.** `support_audit` holds one row per event: the action
(`impersonation.start`, `impersonation.stop`, or `write`), the impersonator, the
impersonated user, the municipality (null for a citizen), the session id, and
for a write the HTTP method, the route pattern (`/api/admin/trucks/:id`), and
the response status. Its foreign keys restrict deletion, so a user or
municipality with history cannot be removed. Rows are never deleted, and only
`status_code` is set, after the request has run. The start and stop rows are
written by the support service. The stop row is written before the session ends,
so a session never ends without a record; a stop whose session end fails leaves
its row with no status. A write row is written by `admit` in
`apps/api/src/internal/shared/middleware/auth.ts`, the single function through
which the staff, permission, and citizen middleware set the request's caller.
Every non-GET, HEAD, or OPTIONS request of an impersonated session gets its row
before the handler runs, and a request whose row cannot be written does not run;
the status is added afterwards. Reads are not recorded. The auth handler's
`/api/auth/*` routes do not pass through `admit`. An impersonated session can
sign out there, which changes no municipality data, and cannot switch
municipality.

## Database ownership

Only `apps/api` may import `@lima-garbage/database`. Change the schema in
`packages/database/src/schema`, generate a migration, review the SQL, and apply
it to the intended database. Keep each migration SQL file with the matching
entry in `migrations/meta/_journal.json`.

The database package contains tables for authentication, organizations, routes,
assignments, trucks, locations, issues, messages, push tokens, and citizen
profiles.

## Route assignment lifecycle

A route assignment pairs a route, a truck and a driver. Its `status` is one of
`scheduled`, `active`, `completed` and `cancelled`.

| Transition              | Who                 | When                                    |
| ----------------------- | ------------------- | --------------------------------------- |
| created as `scheduled`  | staff               | An administrator creates the assignment |
| `scheduled` to `active` | the assigned driver | The driver starts the route             |
| `active` to `completed` | the assigned driver | The driver ends the route               |

Each move is one `UPDATE` that names the expected current status, the driver and
the organization. A request from another driver, another municipality, or for an
assignment in a different state matches no row and fails as not found, so a
state cannot be skipped or repeated. Nothing moves an assignment to `cancelled`
yet, and no transition leaves `completed`.

A driver's location is recorded only against their `active` assignment.
`LocationRepository.recordDriverLocation` reads that assignment with `FOR SHARE`
in the same transaction that writes the current location and the history row,
and holds the lock until the transaction commits. A completion needs a row lock
that conflicts with it, so it waits for the location write to commit and cannot
interleave. A location can therefore never be recorded against an assignment
that has already completed. Without the lock, the read and the write would still
race under `READ COMMITTED`, even inside one transaction.

Filing a driver issue does not take the lock. An issue reports something the
driver saw during the route, and one filed as the route completes belongs to
that assignment. A row that names a just-completed assignment is correct. The
only reader of driver issues, the open-issues list, selects no assignment
column, so nothing depends on the assignment still being `active`. A location is
different: consumers treat a truck location as live only while its assignment is
`active`, so a late write would misstate where the truck is.

## Data freshness

The citizen app polls truck data only while it is active. The API treats a truck
location as usable for citizen status only while it belongs to an active
assignment and was updated within the last ten minutes.

The web API client uses live responses by default. It opts into a short cache
only for list views that change less often.
