# Build → Test → Push Workflow

Run this before every GitHub push.

## Steps

1. **Build the full monorepo**
   ```
   npm run build
   ```
   This builds all 3 workspaces sequentially: `@connext/db` → `connext-web` → `@connext/server`.

2. **Run all tests**
   ```
   npm run test
   ```
   Runs Vitest in all 3 workspaces: server (30 tests), web (10 tests), db (14 tests) = 54 total.

3. **Only if both pass**: stage, commit, push
   ```
   git add <files> && git commit -m "<message>" && git push
   ```

## On failure

- **Build fails**: fix TypeScript errors first. Common culprits: import paths, type mismatches, missing exports.
- **Tests fail**: run the failing workspace individually (`npm run test --workspace=<name>`) to see detailed output.
- Never skip verification. If you're stuck, ask the user.
