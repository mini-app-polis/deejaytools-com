# Stubbed features

Stubbed features awaiting DB schema. Grep `STUB(db)` to find all call sites.

| Feature | Endpoints | Needs | Files |
| --- | --- | --- | --- |
| Teams | GET/POST/PATCH/DELETE `/v1/teams` | `teams` table (`id`, `user_id`→users, `identifier`, `created_at`, `updated_at`) + unique(`user_id`, `identifier`) | `packages/schemas/src/index.ts`, `apps/api/src/routes/teams.ts`, `apps/api/src/app.ts`, `apps/app/src/components/TeamsSection.tsx`, `apps/app/src/pages/MyProfilePage.tsx`, `apps/app/src/api/client.ts` |
