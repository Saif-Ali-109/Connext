# Add Database Schema Changes

Pattern for adding tables, columns, or indexes to the Postgres schema.

## Schema file

Edit `packages/db/src/schema.ts`:
- **New table**: use `pgTable('name', { columns }, (t) => [indexes])`
- **New column**: add to existing table definition
- **New index**: add to the third argument array of `pgTable`
- **Custom index** (GIN trigram, etc.): use `index('name').using('gin', sql\`${t.column} gin_trgm_ops\`)`
- **Raw SQL** (extensions, etc.): export a `sql` template and execute it at startup

## Export

Add new types to the bottom of `schema.ts`:
```ts
export type MyType = typeof myTable.$inferSelect;
```

## Migration

Migrations are auto-run on server startup via `runMigrations()`. To apply changes:
- If the DB was set up via `drizzle-kit push`, the migration SQL files must be idempotent.
- Run `npm run db:generate` (if available) to create a new migration file.
- Or manually edit the latest migration SQL file in `packages/db/drizzle/`.

## Extensions

For `pg_trgm`:
- Add `export const enablePgTrgm = sql\`CREATE EXTENSION IF NOT EXISTS pg_trgm\`` to schema
- Execute it in `apps/server/src/index.ts` before `runMigrations`
