import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword', () => {
  it('returns a string in salt:hash format', async () => {
    const result = await hashPassword('mypassword');
    expect(result).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  });

  it('produces different hashes for the same password (different salt)', async () => {
    const a = await hashPassword('hello');
    const b = await hashPassword('hello');
    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const hashed = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('correct-horse-battery-staple', hashed)).resolves.toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const hashed = await hashPassword('my-secret');
    await expect(verifyPassword('wrong-password', hashed)).resolves.toBe(false);
  });

  it('returns false for malformed stored hash', async () => {
    await expect(verifyPassword('anything', 'not-a-valid-format')).resolves.toBe(false);
  });
});
