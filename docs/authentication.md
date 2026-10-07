# Authentication

[Better Auth](https://www.better-auth.com/docs) manages email and password
sessions, organizations, and members. Clients send the session cookie with each
protected request.
[`createAppAuth`](../packages/database/src/auth/create-auth.ts) builds the one
Better Auth instance that the API and the setup scripts share.

## Two roles

| Role          | Stored in      | Read by                                                                                                |
| ------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `user.role`   | `user` table   | Better Auth's `admin` plugin. Holds `citizen`, `owner`, `admin`, `supervisor`, `driver`, or `support`. |
| `member.role` | `member` table | Every staff check, in the API and in the web dashboard.                                                |

`member.role` is the role in the active organization. It is one of `owner`,
`admin`, `supervisor`, and `driver`, and there is one row per user per
organization. Staff checks do not read `user.role`. The citizen and support
checks do, because `support` lives there; see [Support access](support.md).

A route's permission comes from
[`roles.ts`](../packages/database/src/auth/roles.ts). Each role lists the
actions it may take on routes, trucks, assignments, issues, and locations.

## Who a request is

| Middleware                            | Admits                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `createAuthMiddleware`                | A session with an active organization, a membership in it, and one of the allowed member roles. |
| `createPermissionMiddleware`          | The same session, checked against a resource permission instead of a role list.                 |
| `createCitizenOnlyMiddleware`         | A session with no active organization and no `support` role.                                    |
| `createSupportMiddleware`             | A support user's own session, not an impersonated one.                                          |
| `createImpersonatedSessionMiddleware` | An impersonated session.                                                                        |

All five live in
[`middleware/auth.ts`](../apps/api/src/internal/shared/middleware/auth.ts). The
web dashboard checks the role to decide what to show. The API checks it again
from the membership table and is the security boundary.

The dashboard reads the role from `organization/get-active-member-role` for the
current session cookie, never from `user.role`. When that lookup fails with a
5xx or a connection error, the dashboard fails the request. It does not read the
failure as "no role" and does not sign the user out
([`proxy.ts`](../apps/web/src/proxy.ts),
[`features/auth`](../apps/web/src/features/auth)).

## Mounted Better Auth routes

The auth handler mounts only the paths this repository's clients call. Every
other path Better Auth registers answers `404` before Better Auth runs. That
includes the organization plugin's `organization/create`, `update-member-role`,
`invite-member`, `accept-invitation`, and `get-full-organization`, and the admin
plugin's `set-role`, `create-user`, `ban-user`, `impersonate-user`,
`remove-user`, and `set-user-password`.

The list is `ALLOWED_ROUTES` in
[`handler.ts`](../apps/api/src/internal/domains/auth/handler.ts), and
[API reference](api.md#authentication) tables it. To call another Better Auth
route from a client, add it to `ALLOWED_ROUTES` and add a test in
[`authorization.test.ts`](../apps/api/tests/authorization.test.ts) that asserts
it is mounted.

[`create-auth.ts`](../packages/database/src/auth/create-auth.ts) also sets two
plugin options:

- `allowUserToCreateOrganization: false` on the organization plugin.
- `platformAdminPluginRoles` as the admin plugin's roles. Every municipality
  role has an empty grant in it and `support` grants only `impersonate`.

`appPluginRoles` backs `requirePermission` and the organization plugin.

## Who writes roles

| Writer                                                | Writes                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /api/auth/sign-up/email`                        | `user.role = 'citizen'` and no membership.                                        |
| `POST /api/admin/users` and `POST /api/admin/drivers` | `user.role` and `member.role` together, for a new staff user.                     |
| `setup:municipality`                                  | The organization, its owner's `user.role = 'owner'`, and `member.role = 'owner'`. |
| `db:seed`                                             | Fixture staff users, through `ensureStaffUser`.                                   |
| `setup:support`                                       | `user.role = 'support'`.                                                          |

`setup:support --revoke` resets `user.role` to `citizen`. No HTTP route changes
a role after the account exists. `UpdateUserSchema` has no `role` field.

`AdminService.createOrganizationUser`
([`service.ts`](../apps/api/src/internal/domains/admin/service.ts)) creates the
user through the admin plugin's server-side `createUser`, then `createStaffUser`
writes the membership with a parameterized `INSERT INTO member` in one
transaction on the shared `pg` pool. If the membership write fails, the user it
just created is deleted, so no staff user exists without a membership. A unique
constraint on `member (userId, organizationId)` allows one membership per user
per organization.

`canManageRole` decides which role an actor may assign:

| Actor               | May create                      |
| ------------------- | ------------------------------- |
| `owner`, `admin`    | `admin`, `supervisor`, `driver` |
| `supervisor`        | `driver`                        |
| `driver`, `citizen` | nobody                          |

`PATCH /api/admin/users/:id` checks `canManageRole` against the target's current
role to decide who may edit the account. It rewrites name, email, and password,
and never the role.
