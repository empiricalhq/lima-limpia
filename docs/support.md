# Support access

The platform support team reads every municipality's data and tickets. It
changes data only by impersonating a user. The role is `support`, stored in
`user.role`.

`support` is not a member role. `member_role_enum` cannot hold it and a support
account has no membership, so no staff check in any municipality passes for it.
Support accounts are dedicated: `setup:support` refuses an email that already
has an account, so a municipality user is never promoted.

## Granting and revoking

Only the operator changes the role:

```sh
bun --filter @lima-garbage/database setup:support
bun --filter @lima-garbage/database setup:support --revoke support@example.com
```

`--revoke` demotes the account to `citizen` and deletes its sessions. No HTTP
route writes the role. A municipality owner or admin can neither grant `support`
nor impersonate.

In the admin plugin's role set, `support` grants only `user: ['impersonate']`.
The plugin's `adminRoles` is `['support']`, so impersonating a support user also
needs `impersonate-admins`, which no role has.

## Reading

`/api/support` is the read surface. Every route on it is a `GET` except
`POST /impersonate` and `POST /stop-impersonating`
([`support/handler.ts`](../apps/api/src/internal/domains/support/handler.ts)).
The routes are listed in the [API reference](api.md#support).

- The per-municipality reads run the admin service under an `OrganizationScope`
  built from the URL, after a check that the organization exists. An unknown
  organization answers `404`.
- `/issues/unassigned` reads the reports no municipality owns.
- `/citizens?email=` finds a user with no membership by exact email, so support
  can find a citizen to impersonate.

The support middleware reads the role from the database on every request, so a
revoked support user loses access at once.

## Impersonating

```sh
curl -b jar -c jar -H 'content-type: application/json' \
  -d '{"userId":"<id>","organizationId":"<id>"}' \
  http://localhost:4000/api/support/impersonate
```

```json
{ "data": { "userId": "<id>" } }
```

The response sets the impersonated session's cookie. `organizationId` is
optional.

The target may be any user who is not a support user and not banned. Citizens
are included. An impersonated session cannot start another impersonation.

The session opens in one municipality, and the ordinary staff middleware scopes
it as it scopes the user:

- A user in one municipality gets that one.
- A user in several must be named with `organizationId`, which must be one of
  their memberships.
- A citizen's session has none.

The session stays in that municipality. The `impersonation.start` audit row
records it, and the middleware answers `401` to a request whose
`activeOrganizationId` differs. `organization/set-active` answers `403`.

An impersonated session is in one of these states:

| State    | Entered when                                                         | Effect                                                                   |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Active   | A support user calls `POST /api/support/impersonate`                 | The session acts as the impersonated user.                               |
| Stopped  | The session calls `POST /api/support/stop-impersonating`             | Final. The session is deleted and the support user's own cookie returns. |
| Expired  | 15 minutes pass from `session.createdAt`; the middleware notices     | Final. The middleware answers `401`.                                     |
| Disowned | The operator revokes the impersonator's role; the middleware notices | Final. The middleware answers `401`.                                     |

The 15 minutes are counted from `createdAt` and are never renewed
(`IMPERSONATION_SESSION_SECONDS` in
[`roles.ts`](../packages/database/src/auth/roles.ts)). Better Auth extends
`expiresAt` on use, so `expiresAt` alone does not bound the session.

An impersonated session may do what the impersonated user may do, with one
exception. `AdminService.updateUser` answers `403`, and leaves an audit row,
when the request carries a password or a different email. An impersonator cannot
take over an account's login. Creating users, renaming them, and every other
staff action stay allowed, and audited.

## Audit

`support_audit`
([`schema/support.ts`](../packages/database/src/schema/support.ts)) holds one
row per event:

| Column                          | Holds                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `action`                        | `impersonation.start`, `impersonation.stop`, or `write`.                                                    |
| `impersonator_id`               | The support user.                                                                                           |
| `impersonated_user_id`          | The user acted as.                                                                                          |
| `organization_id`               | The municipality, `NULL` for a citizen.                                                                     |
| `session_id`                    | The impersonated session.                                                                                   |
| `method`, `path`, `status_code` | For a `write`: the HTTP method, the route pattern such as `/api/admin/trucks/:id`, and the response status. |

The foreign keys restrict deletion, so a user or municipality with history
cannot be removed. The application never deletes a row and sets only
`status_code`, after the request has run.

The support service writes the start and stop rows. The stop row is written
before the session ends, so a session never ends without a record. A stop whose
session end fails leaves its row with no status.

`admit` in
[`middleware/auth.ts`](../apps/api/src/internal/shared/middleware/auth.ts)
writes the `write` rows. It is the single function through which the staff,
permission, and citizen middleware set the request's caller. Every request of an
impersonated session that is not `GET`, `HEAD`, or `OPTIONS` gets its row before
the handler runs. A request whose row cannot be written does not run. Reads are
not recorded.

The `/api/auth/*` routes do not pass through `admit`. An impersonated session
can sign out there. That changes no municipality data.
