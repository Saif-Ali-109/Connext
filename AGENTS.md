# Workflow

Before pushing any changes to GitHub, always run:

1. `npm run build` — full monorepo build (all packages)
2. `npm run test` — all tests across all workspaces
3. Only if both pass: `git add`, `git commit`, `git push`

Never skip verification. If build or tests fail, fix before pushing.

# Available Skills

Load any with the `skill` tool.

| Skill | Description |
|-------|-------------|
| `build-test-push` | Full build → test → commit → push cycle |
| `fix-production` | Diagnose and fix Railway deployment errors |
| `add-api-endpoint` | Pattern for adding a new controller + route |
| `add-db-schema` | Pattern for adding tables, columns, or indexes |
