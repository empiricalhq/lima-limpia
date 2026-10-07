# Setup

This page takes a clean checkout to a running API, web dashboard, and database
with sample data.

## Requirements

- [Bun](https://bun.sh) 1.4. [`mise.toml`](../mise.toml) pins the version, and
  `mise install` provides it.
- A PostgreSQL database. A Supabase project works, and so does a local
  container.
- [Docker](https://docs.docker.com/get-started/get-docker/), or any other
  PostgreSQL you can wipe, to run the tests.

## Configure

```sh
cp .env.example .env
bun install
```

The template leaves `BETTER_AUTH_SECRET` and `RESEND_API_KEY` empty and
`DATABASE_URL` as a placeholder. Set these values in `.env` before you run a
script or the API. `openssl rand -base64 32` prints a random secret.

| Variable             | Required | Default                                       | Use                                        |
| -------------------- | -------- | --------------------------------------------- | ------------------------------------------ |
| `DATABASE_URL`       | yes      |                                               | PostgreSQL connection string.              |
| `BETTER_AUTH_SECRET` | yes      |                                               | Signs sessions. Use a random value.        |
| `RESEND_API_KEY`     | yes      |                                               | Sends the password-reset email.            |
| `BETTER_AUTH_URL`    | no       | `http://localhost:4000`                       | Public origin of the API.                  |
| `EMAIL_FROM`         | no       | `onboarding@resend.dev`                       | Sender address.                            |
| `EMAIL_FROM_NAME`    | no       | `Lima Limpia`                                 | Sender name.                               |
| `PORT`               | no       | `4000`                                        | API port.                                  |
| `CORS_ORIGINS`       | no       | `http://localhost:3000,http://localhost:4000` | Origins the API answers with CORS headers. |
| `TRUSTED_ORIGINS`    | no       | `http://localhost:3000,http://localhost:4000` | Origins Better Auth accepts requests from. |

The API reads [`config.ts`](../apps/api/src/internal/shared/config/config.ts)
and exits at startup when a required value is missing.

## Create the database

```sh
bun --filter @lima-garbage/database db:push
```

## Create a municipality

A municipality is an organization with one first owner. No HTTP route creates
one, so the operator runs the interactive script once per municipality:

```sh
bun --filter @lima-garbage/database setup:municipality
```

It asks for the municipality's name and slug, and the owner's name, email, and
password. The owner can sign in to the dashboard at once.

## Create a support account

The platform support team reads every municipality and changes data only by
impersonating a user. See [Support access](support.md). The account must be new:

```sh
bun --filter @lima-garbage/database setup:support
bun --filter @lima-garbage/database setup:support --revoke support@example.com
```

The second command demotes the account to `citizen` and deletes its sessions.

## Add sample data

`db:seed` adds trucks, a route, an assignment, and users to the oldest
municipality. Run it only against a development database.

```sh
bun --filter @lima-garbage/database db:seed
```

The seeded users share the password `password123`:

| Email                    | Role       | Scope                      |
| ------------------------ | ---------- | -------------------------- |
| `supervisor@example.com` | supervisor | The oldest municipality.   |
| `driver@example.com`     | driver     | The oldest municipality.   |
| `citizen@example.com`    | citizen    | No municipality; sees all. |

## Run the API

```sh
bun --filter @lima-garbage/api dev
```

```sh
curl http://localhost:4000/api/health
```

```json
{ "status": "ok", "timestamp": "2026-10-06T17:21:29.825Z" }
```

## Run the web dashboard

The dashboard reads its own environment file. Copy the template and start it in
a second terminal:

```sh
cp apps/web/env.example apps/web/.env.local
bun --filter @lima-garbage/web dev
```

`API_BASE_URL` in that file must point at the API. The dashboard listens on
`http://localhost:3000`. Sign in with the owner from `setup:municipality`.
Owners, admins, and supervisors can sign in. See
[`apps/web`](../apps/web/readme.md).

## Run the citizen app

The citizen app needs a development build, not Expo Go. See
[`apps/citizen`](../apps/citizen/readme.md).

## Run the tests

`mise run check:test`, and therefore `mise run check`, applies the migrations to
the database in `DATABASE_URL`, then runs the API and database tests against it.
The tests clear every table in that database, so it must not be your development
database. Start a throwaway PostgreSQL with Docker:

```sh
docker run -d --rm --name lima-limpia-test-db -p 127.0.0.1:54329:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lima_limpia_test postgres:17-alpine
```

Point the tests at it, run the checks, and stop the container:

```sh
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/lima_limpia_test
export BETTER_AUTH_SECRET=test-secret
export RESEND_API_KEY=test-key
mise run check
docker stop lima-limpia-test-db
```

Instead of exporting the variables, you can put them in `.env.test` at the
repository root. [`.env.test.example`](../.env.test.example) is the template.
Variables already in your environment take priority over the file.

The API test server listens on port 4000. Stop a running development API first,
or the tests send their requests to it.

To run the test suites alone, apply the migrations once with the variables
above, then run the package scripts:

```sh
bun --filter @lima-garbage/database db:migrate
bun --filter @lima-garbage/api test
bun --filter @lima-garbage/database test
```
