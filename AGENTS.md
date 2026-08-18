# AGENTS.md — Discipline

## Scope
Applies to all files under the repository root.

## Coding Fundamentals

- **TypeScript strict**: All `.ts` / `.tsx` must pass `npm run typecheck`.
- **Tests**: Run `npm test` (Jest + jest-expo). Add tests for new logic and components. Tests and typecheck must pass before merging — enforced in `security-check.sh` and `update-and-launch.sh`.
- **Layered architecture**: App (`app/`) → Lib (`lib/`) → Supabase (`supabase/`). Do not leak DB logic into components.
- **Security first**: Never commit `.env`, service role keys, or NVIDIA keys. Run `npm run security:check` before pushing. Copy `.env.example` → `.env` and fill in `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- **Private storage**: `meals.photo_url` stores private object keys (`meal-photos` bucket), not public URLs.
- **Local builds**: `scripts/build-apk.sh` builds a debug APK locally (portable JDK + Android SDK in `.local-build/`). No sudo or system-wide SDK install required. Sources `.env` so Supabase keys are baked into the JS bundle.
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`) runs `typecheck` + tests on every push/PR. Free tier covers all automated testing.
- **Agent behavior**: Before editing, confirm target file with user. Reference exact paths (`app/(app)/index.tsx`, `lib/meals.ts`, etc.).
- **Commits**: Make meaningful, targeted commits grouped by concern (feat, test, build, chore). Never `git add .` as a blob. Run `npm test` and `npm run typecheck` before every commit. Revert with `git revert <hash>` if a pushed commit breaks main.

## Git Workflow

1. Implement feature → write tests → `npm test` → `npm run typecheck`
2. Stage only the files relevant to one logical change
3. Commit with a conventional message (`feat:`, `test:`, `build:`, `chore:`, etc.)
4. Push after each feature lands and tests are green
