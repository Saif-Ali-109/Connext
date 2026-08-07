import { describe, it, expect, vi } from 'vitest';

// Mock @connext/db so username.ts can import `users` / `type Db` without a real DB.
vi.mock('@connext/db', () => ({ users: { username: 'username_col' } }));

import { sanitizeUsernameBase, generateUniqueUsername } from '../lib/username';

const RE = /^[a-z0-9_]{3,24}$/;

describe('sanitizeUsernameBase', () => {
  it('lowercases and replaces disallowed chars with underscore', () => {
    expect(sanitizeUsernameBase('First.Last+news')).toBe('first_last_news');
  });
  it('collapses repeats and trims edge underscores', () => {
    expect(sanitizeUsernameBase('__a..b__')).toBe('a_b');
  });
  it('returns null for non-ascii-only input', () => {
    expect(sanitizeUsernameBase('陈伟')).toBeNull();
  });
  it('returns null for empty/nullish', () => {
    expect(sanitizeUsernameBase('')).toBeNull();
    expect(sanitizeUsernameBase(null)).toBeNull();
    expect(sanitizeUsernameBase(undefined)).toBeNull();
  });
  it('clamps to 24 chars', () => {
    const out = sanitizeUsernameBase('a'.repeat(40))!;
    expect(out.length).toBe(24);
  });
});

describe('generateUniqueUsername', () => {
  // Helper: a db mock that reports a username as taken based on the actual candidate.
  // We intercept by having findFirst inspect a shared `lastArg` we can't read from eq(),
  // so instead we drive collisions by making findFirst return "taken" a fixed number
  // of times, then free. That models "base taken, base_1 free", etc.
  function dbTakenForFirstN(n: number) {
    let calls = 0;
    return {
      query: { users: { findFirst: vi.fn(async () => (calls++ < n ? { id: 'x' } : undefined)) } },
    } as any;
  }

  it('derives from email local-part', async () => {
    const db = dbTakenForFirstN(0);
    const u = await generateUniqueUsername(db, { email: 'saif.ali@gmail.com', name: 'Saif' });
    expect(u).toBe('saif_ali');
    expect(RE.test(u)).toBe(true);
  });

  it('pads a too-short local-part to the 3-char minimum', async () => {
    const db = dbTakenForFirstN(0);
    const u = await generateUniqueUsername(db, { email: 'a@x.com', name: null });
    expect(u).toBe('a00');
    expect(RE.test(u)).toBe(true);
  });

  it('falls back to name when email has no usable local-part', async () => {
    const db = dbTakenForFirstN(0);
    const u = await generateUniqueUsername(db, { email: '陈伟@x.com', name: 'Jane Doe' });
    expect(u).toBe('jane_doe');
    expect(RE.test(u)).toBe(true);
  });

  it('falls back to a random handle when neither email nor name is usable', async () => {
    const db = dbTakenForFirstN(0);
    const u = await generateUniqueUsername(db, { email: '陈伟@x.com', name: '陈伟' });
    expect(u).toMatch(/^user_[0-9a-f]{8}$/);
    expect(RE.test(u)).toBe(true);
  });

  it('appends a numeric suffix on collision (base taken -> base_1)', async () => {
    const db = dbTakenForFirstN(1); // base is taken, next candidate free
    const u = await generateUniqueUsername(db, { email: 'john@x.com', name: null });
    expect(u).toBe('john_1');
    expect(RE.test(u)).toBe(true);
  });

  it('keeps result within 24 chars even with a long base + suffix', async () => {
    const db = dbTakenForFirstN(1);
    const u = await generateUniqueUsername(db, { email: `${'a'.repeat(40)}@x.com`, name: null });
    expect(u.length).toBeLessThanOrEqual(24);
    expect(RE.test(u)).toBe(true);
  });

  it('always returns a regex-valid handle for a range of inputs', async () => {
    const inputs = [
      { email: 'UPPER@x.com', name: null },
      { email: '...@x.com', name: 'Bob' },
      { email: 'a_b_c@x.com', name: null },
      { email: null, name: 'X' },
      { email: null, name: null },
    ];
    for (const inp of inputs) {
      const u = await generateUniqueUsername(dbTakenForFirstN(0), inp);
      expect(RE.test(u)).toBe(true);
    }
  });
});
