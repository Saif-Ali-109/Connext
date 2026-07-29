---
name: fix-production
description: Diagnose and fix Railway deployment errors
---

## Common errors

| Error | Fix |
|-------|-----|
| `Can't find meta/_journal.json` | Add `COPY --from=builder /app/packages/db/drizzle ./packages/db/drizzle` to `apps/server/Dockerfile` |
| `ERR_ERL_KEY_GEN_IPV6` | Import `ipKeyGenerator` from `express-rate-limit`, use `ipKeyGenerator(req.ip)` in `keyById` |
| Server crashes after migration notices | Migration SQL needs `IF NOT EXISTS` — edit `packages/db/drizzle/*.sql` |

## Key files
- `apps/server/Dockerfile`
- `apps/server/src/middleware/rateLimiter.ts`
- `packages/db/drizzle/*.sql`
- `apps/server/src/index.ts`

## Always verify
`npm run build && npm run test` before pushing.
