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

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/app/.env.example apps/app/.env
# Fill DATABASE_URL, CLERK_JWKS_URL, VITE_CLERK_PUBLISHABLE_KEY, etc.
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm dev:api   # http://localhost:3001
pnpm dev:app   # http://localhost:5173
```

Initialize shadcn/ui later (not part of this scaffold):

```bash
cd apps/app && npx shadcn@latest init
```

## Environment

- **API**: `DATABASE_URL`, `CLERK_JWKS_URL`, `CORS_ORIGINS`, `PORT`, optional Google Drive vars for future uploads.
- **App**: `VITE_API_URL` (defaults to proxy target in dev), `VITE_CLERK_PUBLISHABLE_KEY`.

## Versioning

`main` uses [semantic-release](https://semantic-release.gitbook.io/) with Conventional Commits; the changelog and root `package.json` version are updated automatically on release.

## License

Private — All rights reserved.
