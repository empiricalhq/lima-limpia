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

Not every domain has every file. `admin`, `auth`, `citizen`, `driver`, and
`health` expose handlers. `trucks`, `routes`, `assignments`, `issues`, and
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
  not the source of staff access checks.
- `member.role` is the role in the active organization, stored on the `member`
  table (one row per user per organization). Staff routes, and the web
  dashboard's own access checks, read this value. The current roles are `owner`,
  `admin`, `supervisor`, and `driver`.

Better Auth's `organization` and `admin` plugins mount their own endpoints under
`/api/auth/*`, each with its own permission check independent of this app's
`/api/admin/*` routes and `canManageRole`. Both plugins share this app's
access-control statements (`apps/api/src/internal/shared/auth/roles.ts`), which
also back `requirePermission` for the app's own admin routes — so a statement
added for route-level gating (e.g. `user: ['create']`, needed so a supervisor
can call `POST /api/admin/users`) also, unless guarded, authorizes the plugin's
own raw HTTP endpoint for the same resource, with no equivalent to
`canManageRole`'s hierarchy. Worse, Better Auth grants an organization's
creator (`owner`, the plugin's `creatorRole` default) every permission on
member-role endpoints regardless of `roles`/`ac` at all
(`allowCreatorAllPermissions`, on by default in the `organization` plugin's
`update-member-role`): an owner could call it and promote any member,
including to owner, no matter how `roles` was configured. Access-control
statements cannot close that off, so closing each dangerous endpoint's
`ac` grant one at a time is a dead end.

`apps/api/src/internal/domains/auth/handler.ts` instead mounts only the
`/api/auth/*` paths this app's own clients (`apps/web`, `apps/citizen`) call:
`get-session`, `sign-in/email`, `sign-up/email`, `sign-out`,
`request-password-reset`, `reset-password`, the `GET reset-password/:token`
link Better Auth's own password-reset email sends,
`organization/get-active-member-role`, `organization/list`, and
`organization/set-active`. Every other endpoint either plugin registers —
`organization/create`, `update-member-role`, `invite-member`,
`accept-invitation`, `get-full-organization`, and the `admin` plugin's own
`set-role`, `create-user`, `ban-user`, `impersonate-user`, `remove-user`, and
`set-user-password` — returns 404 before Better Auth's handler ever runs, so no
caller can reach them with their own session regardless of role or plugin
permission configuration.

This allowlist is exactly the set of `{method, path}` pairs `apps/web` and
`apps/citizen` call today, not a broader guess at what Better Auth documents.
A new call site means adding its route to `ALLOWED_ROUTES` in `handler.ts`
and a passing test in `apps/api/tests/authorization.test.ts` asserting it is
mounted — not widening the allowlist ahead of an actual caller.

Two plugin options are also still set, as defense in depth in case the
allowlist above is ever loosened or a future feature calls one of these
endpoints programmatically with a real user session (today nothing does; the
one caller that legitimately creates organizations and members,
`AdminService.createOrganizationUser`, does so through different, server-only
APIs — see below):

- `allowUserToCreateOrganization: false` on the `organization` plugin, so even
  a reachable `organization/create` could not let an authenticated user become
  an organization's owner — the app's own resources (trucks, routes, issues,
  assignments) have no `organizationId` to scope against, so "owner of some
  organization" would read as "owner of everything" to
  `resolveActiveOrganizationRoles`.
- A separate, empty role set (`disabledAdminPluginRoles` in `roles.ts`) passed
  to the `admin` plugin only, so none of its endpoints authorize for any role.
  `appPluginRoles` is unchanged and still backs `requirePermission` and the
  `organization` plugin.

`AdminService.createOrganizationUser` (called from `createUser` and
`createDriver` in `apps/api/src/internal/domains/admin/service.ts`) is the only
*request*-reachable writer of `member.role`, and the only request-reachable
writer of `user.role` to anything other than the default. It calls two Better
Auth server APIs
directly (`this.authService.api.*`, not `fetch`), bypassing the HTTP handler
(and its allowlist) entirely, with no session headers, so both run as Better
Auth's own "system action": `addMember` (the `organization` plugin) writes
`member.role` and has no HTTP path at all — Better Auth's SDK never registers
it on the router; `createUser` (the `admin` plugin) writes `user.role` and
does have an HTTP path (`/api/auth/admin/create-user`), closed above by the
handler's allowlist, so no caller can reach it with their own session.
`createOrganizationUser` calls both in the same request, so the two fields stay
consistent. `canManageRole` in `apps/api/src/internal/shared/auth/roles.ts`
limits which role an actor may assign this way: an owner or admin may create an
admin, supervisor, or driver; a supervisor may only create a driver.
`updateUser` cannot change either role — `UpdateUserSchema` has no `role` field,
and the service only rewrites name, email, and password. It still calls
`canManageRole`, but there against the target's existing role, to gate who may
edit that account, not to authorize a role change.

The public `POST /api/auth/sign-up/email` endpoint also writes `user.role`, to
the `admin` plugin's `defaultRole` (`'citizen'`, set in
`apps/api/src/internal/domains/auth/service.ts`): the plugin registers a
`databaseHooks.user.create.before` hook that runs for every user creation,
including this one, and sets `role: defaultRole` unless the caller already
supplied one. A self-registered citizen never has an active organization, so
this write does not interact with `member.role` or staff access at all — it only
affects what `user.role` (not read for staff checks) holds for that account.

`packages/database/scripts/create-admin.ts` (`setup:admin`) is the one other
writer of `member.role`: a separate Better Auth instance with no `admin`
plugin and the `organization` plugin at its default `allowUserToCreateOrganization`.
It calls `auth.api.createOrganization` with no session and the new user's `id`
as `body.userId`, which Better Auth treats as a system action (bypassing
`allowUserToCreateOrganization` entirely) and inserts the caller's own
membership with `role: creatorRole`, `'owner'` by default and unconfigured
here. This is the bootstrap write of `member.role = 'owner'` for the
organization's first member — every later `member.role` write for every other
member goes through `createOrganizationUser` above. `setup:admin` only runs
once, guarded by `checkExistingOrganization`, and is a local script invoked
directly (`bun run scripts/create-admin.ts`), not reachable over HTTP, so it
does not reintroduce the escalation above.

Citizens are authenticated users without an active organization. The citizen
middleware rejects a session that has an active organization. Staff middleware
requires both an active organization and an allowed member role.

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
    apiAuth --> organization{Active organization?}
    organization -->|yes| staff[Staff route<br/>member.role check]
    organization -->|no| citizen[Citizen route]
    staff --> rules[Business rules and database]
    citizen --> rules
    webCheck[Web access checks] -. navigation only .-> request
```

## Database ownership

Only `apps/api` may import `@lima-garbage/database`. Change the schema in
`packages/database/src/schema`, generate a migration, review the SQL, and apply
it to the intended database. Keep each migration SQL file with the matching
entry in `migrations/meta/_journal.json`.

The database package contains tables for authentication, organizations, routes,
assignments, trucks, locations, issues, messages, push tokens, and citizen
profiles.

## Data freshness

The citizen app polls truck data only while it is active. The API treats a truck
location as usable for citizen status only while it belongs to an active
assignment and was updated within the last ten minutes.

The web API client uses live responses by default. It opts into a short cache
only for list views that change less often.
