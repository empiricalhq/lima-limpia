# Manual

1. [Setup](setup.md): configure, create a database and a municipality, and run
   the API and the web dashboard.
2. [API reference](api.md): every route, with request fields and sample
   responses.
3. [Authentication](authentication.md): sessions, roles, and which Better Auth
   routes are mounted.
4. [Tenancy](tenancy.md): how one deployment keeps municipalities apart.
5. [Support access](support.md): the support role, impersonation, and its audit
   log.
6. [Assignments and locations](assignments.md): the assignment lifecycle and
   when a truck location counts as live.

Each workspace has its own readme for running and building it:
[`apps/api`](../apps/api/readme.md), [`apps/web`](../apps/web/readme.md),
[`apps/citizen`](../apps/citizen/readme.md),
[`apps/server`](../apps/server/readme.md),
[`packages/database`](../packages/database/readme.md),
[`packages/email`](../packages/email/readme.md), and
[`datasets`](../datasets/readme.md).

The code map is in [Architecture](../ARCHITECTURE.md). Checks and pull requests
are in [Contributing](../CONTRIBUTING.md).
