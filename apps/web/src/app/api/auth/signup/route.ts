import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { createDb, users, hashPassword } from '@connext/db';

const databaseUrl = process.env.DATABASE_URL;

const db = databaseUrl ? createDb(databaseUrl) : null;

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

/**
 * Anonymous signup: create an account from just a username + password, no
 * email. The client signs in through the Credentials provider right after.
 */
export async function POST(req: Request) {
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  let body: { username?: string; displayName?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const displayName = String(body.displayName ?? '').trim();

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: 'Username must be 3-24 chars: lowercase letters, numbers, underscore' },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    );
  }

  const taken = await db.query.users.findFirst({
    where: eq(users.username, username),
  });
  if (taken) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }

  try {
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      username,
      passwordHash,
      displayName: displayName || username,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    // Unique constraint race: another request claimed the same username first.
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }
    console.error('[signup]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
