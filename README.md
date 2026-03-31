# deejaytools-com

Monorepo for [deejaytools.com](https://deejaytools.com): a West Coast Swing routine and floor-trial management platform.

## Structure

| Path | Role |
|------|------|
| `packages/ts-utils` | Shared TypeScript utilities (logger, API envelope, Clerk JWT verify, Zod schemas) |
| `apps/api` | Hono API on Node, Drizzle + PostgreSQL, Clerk auth |
| `apps/app` | Vite + React + Tailwind frontend, Clerk |

## Stack

| Layer | Technology |
|-------|------------|
| Package manager | pnpm 9 workspaces |
| Language | TypeScript (strict), ES modules |
| API | Hono, Drizzle ORM, postgres.js, Railway |
| App | Vite 6, React 19, Tailwind 3, React Router 7, Clerk |
| Release | semantic-release on `main` |

## Developer setup

**Prerequisites**
- Node.js 22+
- pnpm 9 (`npm install -g pnpm`)

**Install**
```bash
pnpm install
```

**Environment**
```bash
cp apps/api/.env.example apps/api/.env
cp apps/app/.env.example apps/app/.env
# Fill in DATABASE_URL, CLERK_JWKS_URL, VITE_CLERK_PUBLISHABLE_KEY at minimum
```

**Database**
```bash
pnpm --filter api db:generate   # generate migration files (first time only)
pnpm --filter api db:migrate    # apply schema to database
```

**Run**
```bash
pnpm dev:api   # http://localhost:3001
pnpm dev:app   # http://localhost:5173
```

**Test**
```bash
pnpm test
```

**Typecheck and lint**
```bash
pnpm typecheck
pnpm lint
```

## Environment

- **API**: `DATABASE_URL`, `CLERK_JWKS_URL`, `CORS_ORIGINS`, `PORT`, `TICK_SECRET`, `SENTRY_DSN`. Google Drive vars required for song upload: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_DRIVE_PARENT_FOLDER_ID`.
- **App**: `VITE_API_URL` (defaults to proxy target in dev), `VITE_CLERK_PUBLISHABLE_KEY`.

## Versioning

`main` uses [semantic-release](https://semantic-release.gitbook.io/) with Conventional Commits; the changelog and root `package.json` version are updated automatically on release.

## License

Private — All rights reserved.
