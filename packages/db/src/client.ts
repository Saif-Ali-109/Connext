import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

export async function runMigrations(connectionString: string) {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.join(__dirname, '..', 'drizzle'),
  });
  await client.end();
}
