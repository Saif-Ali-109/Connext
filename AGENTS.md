# Workflow

Before pushing any changes to GitHub, always run:

1. `npm run build` — full monorepo build (all packages)
2. `npm run test` — all tests across all workspaces
3. Only if both pass: `git add`, `git commit`, `git push`

Never skip verification. If build or tests fail, fix before pushing.
