import { eq } from 'drizzle-orm';
import { users, type Db } from '@connext/db';
import crypto from 'crypto';

// Handles must match this everywhere (signup, onboarding, rename). Keep in sync
// with USERNAME_RE on the client and in auth.controller.ts.
const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const MIN_LEN = 3;
const MAX_LEN = 24;

/**
 * Reduce an arbitrary string to a regex-safe username base, or `null` if nothing
 * usable survives (e.g. a non-ASCII-only input). Does NOT pad short results —
 * an empty base must fall through to the next source in the derivation chain.
 */
export function sanitizeUsernameBase(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let out = '';
  let lastWasUnderscore = false;
  for (let i = 0; i < raw.length && out.length < MAX_LEN; i++) {
    const ch = raw[i].toLowerCase();
    if (ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9') {
      out += ch;
      lastWasUnderscore = false;
    } else if (!lastWasUnderscore && out.length > 0) {
      // Skip leading separators; collapse interior runs to a single underscore.
      out += '_';
      lastWasUnderscore = true;
    }
  }
  // Trim trailing underscore
  if (out.endsWith('_')) out = out.slice(0, -1);
  return out || null;
}

/** Grow a nonempty base up to the 3-char minimum, then clamp to the max. */
function padToMin(s: string): string {
  let out = s;
  while (out.length < MIN_LEN) out += '0';
  return out.slice(0, MAX_LEN);
}

/** A guaranteed-valid fallback handle: `user_` + 8 hex chars = 13 chars. */
function randomHandle(): string {
  return `user_${crypto.randomBytes(4).toString('hex')}`;
}

/** email local-part → name → random, whichever first yields a valid base. */
function deriveBase(email?: string | null, name?: string | null): string {
  const fromEmail = sanitizeUsernameBase(email ? email.split('@')[0] : null);
  if (fromEmail) return padToMin(fromEmail);
  const fromName = sanitizeUsernameBase(name);
  if (fromName) return padToMin(fromName);
  return randomHandle();
}

/**
 * Produce a username that satisfies USERNAME_RE and is free of existing rows.
 * Tries the derived base, then `base_1..base_20` (trimming the base so the suffix
 * fits 24 chars), then checked random handles. The final fallback is unchecked —
 * the caller's 23505 (unique-violation) retry is the authoritative safety net.
 */
export async function generateUniqueUsername(
  db: Db,
  opts: { email?: string | null; name?: string | null }
): Promise<string> {
  const base = deriveBase(opts.email, opts.name);

  const candidates = [base];
  for (let n = 1; n <= 20; n++) {
    const suffix = `_${n}`;
    candidates.push(`${base.slice(0, MAX_LEN - suffix.length)}${suffix}`);
  }

  for (const cand of candidates) {
    if (!USERNAME_RE.test(cand)) continue;
    const taken = await db.query.users.findFirst({ where: eq(users.username, cand) });
    if (!taken) return cand;
  }

  for (let i = 0; i < 5; i++) {
    const cand = randomHandle();
    const taken = await db.query.users.findFirst({ where: eq(users.username, cand) });
    if (!taken) return cand;
  }

  return randomHandle();
}
