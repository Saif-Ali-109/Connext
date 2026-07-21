import dotenv from 'dotenv';
dotenv.config();

import { sql } from 'drizzle-orm';
import { createDb, type Db } from '@connext/db';
import { readEnv, readNumberEnv } from './env';

export const JWT_SECRET = readEnv('JWT_SECRET', 'dev_jwt_secret_change_me', {
  requiredInProduction: true,
});
export const AUTH_SECRET = readEnv('AUTH_SECRET', JWT_SECRET, {
  requiredInProduction: true,
});
export const JWT_EXPIRES_DAYS = readEnv('JWT_EXPIRES_DAYS', '7d');
export const DATABASE_URL = readEnv(
  'DATABASE_URL',
  'postgresql://postgres:postgres@localhost:5432/connext',
  { requiredInProduction: true }
);
// Express always runs on 4001 internally — Railway's $PORT is reserved for Next.js
export const PORT = 4001;
export const ALLOWED_ORIGINS = readEnv(
  'ALLOWED_ORIGINS',
  'http://localhost:3000'
)
  .split(',')
  .map((o) => o.trim());

let dbInstance: Db | null = null;

export function getDb(): Db {
  if (!dbInstance) {
    dbInstance = createDb(DATABASE_URL);
  }
  return dbInstance;
}

export async function connectDB() {
  const db = getDb();
  await db.execute(sql`select 1`);
  return db;
}
