# Agent rules

The code map is in [ARCHITECTURE.md](ARCHITECTURE.md). Checks are in
[CONTRIBUTING.md](CONTRIBUTING.md).

- Write code, identifiers, and code comments in English. Write UI text, emails,
  and setup-script prompts in Spanish.
- In `apps/api`, write SQL by hand in `queries.ts` and run it through `pg`. Do
  not use the Drizzle query builder. Drizzle defines the schema.
- Follow Handler, Service, Repository in each domain. Register new dependencies
  in `container.ts`.
- Services throw `AppError` subclasses. They do not return raw errors.
- Services and handlers do not call `db.query`. Add a repository method.
- Every repository method on a tenant table takes a scope as its first argument
  and builds its SQL with `tenantQuery`.
- Authorize staff by `member.role`. Do not read `user.role` for staff checks.
- A `GET` handler under `/api/support` must not call a repository write.
- Only `apps/api` imports `@lima-garbage/database`.
- In `apps/web`, call the API from server components and server actions only.
- Add a Better Auth route to `ALLOWED_ROUTES` only with a test in
  `apps/api/tests/authorization.test.ts` that asserts it is mounted.
- Keep each migration SQL file with its entry in
  `packages/database/migrations/meta/_journal.json`. Do not edit generated
  snapshots by hand.
- API and database tests get their database from `startTestDatabase` in
  `packages/database/testing`. Do not point a test at a database you did not
  start.
- Run the seed script only against a development database.
