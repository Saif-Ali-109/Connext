# Fix Production Deployment

Diagnose and fix issues on Railway.

## Steps

1. **Check what the actual error is**
   - If there's a `_journal.json` error → missing `drizzle` folder in Docker image. Add `COPY` in `apps/server/Dockerfile`.
   - If there's a `ERR_ERL_KEY_GEN_IPV6` error → rate limiter needs `ipKeyGenerator()` helper.
   - If server crashes after migrations run → migration SQL may not be idempotent (tables already exist). Add `IF NOT EXISTS`.
   - If `relation already exists` or duplicate errors → migration files use plain `CREATE TABLE`/`ADD COLUMN`. Rewrite with `IF NOT EXISTS` or `ADD COLUMN IF NOT EXISTS`.

2. **Common files to check**
   - `apps/server/Dockerfile` — missing `COPY` for `packages/db/drizzle`
   - `apps/server/src/middleware/rateLimiter.ts` — `ipKeyGenerator` import
   - `packages/db/drizzle/*.sql` — migration SQL idempotency
   - `apps/server/src/index.ts` — startup order, error handling

3. **Verify locally**
   - Build: `npm run build`
   - If docker is available: `docker compose build && docker compose up`
   - If not, the build + test pass is the minimum gate.

4. **After fix**: build → test → push
