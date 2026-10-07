# API

`apps/api` is the Hono application that owns authentication, business rules, and
database writes. The routes are in the [API reference](../../docs/api.md). The
code layout is in [Architecture](../../ARCHITECTURE.md#api-structure).

## Run

Set up the environment as described in [Setup](../../docs/setup.md), then:

```sh
bun --filter @lima-garbage/api dev
```

The server listens on `http://localhost:4000`. `dev` reloads on change and reads
the root `.env`. `start` runs the server once without reloading.

## Test

```sh
bun --filter @lima-garbage/api test
```

[`test-runner.ts`](test-runner.ts) starts the server with `DATABASE_URL`,
`BETTER_AUTH_SECRET`, and `RESEND_API_KEY` from the environment or from the root
`.env.test`, waits for it, then runs the test files in sequence. The tests clear
every table in that database, so point it at a throwaway one.
[Setup](../../docs/setup.md#run-the-tests) shows how to start one.

## Deploy

The checked-in [`wrangler.toml`](wrangler.toml) builds a Cloudflare Worker:

```sh
bun --filter @lima-garbage/api build:worker
bun --filter @lima-garbage/api deploy
```

Set the secrets with Wrangler first:

```sh
cd apps/api
bun x wrangler secret put DATABASE_URL
bun x wrangler secret put BETTER_AUTH_SECRET
bun x wrangler secret put RESEND_API_KEY
```
