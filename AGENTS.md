# AGENTS.md — Discipline

## Scope
Applies to all files under the repository root.

## Coding Fundamentals

- **TypeScript strict**: All `.ts` / `.tsx` must pass `npm run typecheck`.
- **Layered architecture**: App (`app/`) → Lib (`lib/`) → Supabase (`supabase/`). Do not leak DB logic into components.
- **Security first**: Never commit `.env`, service role keys, or NVIDIA keys. Run `npm run security:check` before pushing.
- **Private storage**: `meals.photo_url` stores private object keys (`meal-photos` bucket), not public URLs.
- **Agent behavior**: Before editing, confirm target file with user. Reference exact paths (`app/(app)/index.tsx`, `lib/meals.ts`, etc.).
