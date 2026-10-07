# Web dashboard

`apps/web` is the Next.js dashboard for municipal staff. Server components and
server actions read data through the API. The browser does not connect to the
API or the database directly.

## Run locally

Copy [`env.example`](env.example) to `.env.local` and set `API_BASE_URL` to the
API origin. The file also sets `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_APP_URL`,
which default to `http://localhost:3000`.

```sh
cp apps/web/env.example apps/web/.env.local
bun --filter @lima-garbage/web dev
```

The app runs on `http://localhost:3000`. [Setup](../../docs/setup.md) covers the
API and the first sign-in.

## Build

`next build` reads `API_BASE_URL` and `NEXT_PUBLIC_BASE_URL` and fails without
them. Nothing is requested during the build, so the values only have to be URLs.

```sh
bun --filter @lima-garbage/web build
bun --filter @lima-garbage/web start
```

The Cloudflare Pages build uses [`build-pages.sh`](build-pages.sh). It deletes
the root `package.json` and `bun.lock` before installing the Pages adapter, so
run it only in a throwaway checkout.

## Access control

Owners, admins, and supervisors can sign in. The settings page needs an owner or
an admin. `src/proxy.ts` checks the member role on `/dashboard` requests, and
server actions call `requireRole` from `features/auth/lib.ts`. The API repeats
every check and is the security boundary. See
[Authentication](../../docs/authentication.md).
