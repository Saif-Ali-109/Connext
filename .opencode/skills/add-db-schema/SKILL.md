---
name: add-db-schema
description: Pattern for adding tables, columns, or indexes to the Postgres schema
---

## Edits file
`packages/db/src/schema.ts`

## Patterns

| Task | Code |
|------|------|
| New table | `pgTable('name', { columns }, (t) => [indexes])` |
| New column | Add field to existing table definition |
| Standard index | `index('name').on(t.column)` |
| GIN trigram | `index('name').using('gin', sql\`${t.column} gin_trgm_ops\`)` |
| Extension | Export `sql` template, execute at server startup |

## Export new types
```ts
export type MyType = typeof myTable.$inferSelect;
```

## Migration
Migrations auto-run on startup. For existing DBs, migration SQL must be idempotent.
