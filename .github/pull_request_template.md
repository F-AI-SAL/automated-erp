## What & why

<!-- Short description of the change and the problem it solves. Link the issue. -->

Closes #

## Type

- [ ] Feature
- [ ] Fix
- [ ] Refactor / chore
- [ ] Docs

## Checklist

- [ ] `npm run typecheck` passes locally
- [ ] `npm run lint` passes locally
- [ ] New/changed cross-module effects go through the **EventBus** (no direct module coupling)
- [ ] DB changes include a migration in `db/migrations/` and keep **RLS** on tenant tables
- [ ] Smoke test still passes (`npm run test:smoke` against local Postgres) — or updated
- [ ] No secrets committed; `.env` is not tracked

## Notes for reviewer

<!-- Anything risky, follow-ups, or areas to focus review on. -->
