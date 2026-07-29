---
name: build-test-push
description: Full monorepo build, test, commit, and push to GitHub
---

## Steps

1. **Build**: `npm run build` (all 3 workspaces: db, web, server)
2. **Test**: `npm run test` (54 tests across all workspaces)
3. **Only if both pass**: `git add <files> && git commit -m "<msg>" && git push`

## On failure
- Build fails → fix TypeScript errors first
- Tests fail → run individually: `npm run test --workspace=<name>`
- Never skip verification
