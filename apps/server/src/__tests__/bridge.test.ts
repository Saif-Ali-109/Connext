import { describe, it, expect, beforeAll } from 'vitest';
import { signBridgePayload, verifyBridgePayload, type BridgePayload } from '../lib/bridge';

describe('signBridgePayload / verifyBridgePayload', () => {
  const payload = { userId: 'user-123', email: 'test@example.com', name: 'Test User' };

  it('signs and verifies a valid payload', () => {
    const { payload: full, sig } = signBridgePayload(payload);
    expect(full.userId).toBe('user-123');
    expect(full.exp).toBeGreaterThan(Date.now());
    expect(sig).toBeTruthy();
    expect(verifyBridgePayload(full, sig)).toBe(true);
  });

  it('rejects an expired payload', () => {
    const expired: BridgePayload = { userId: 'x', exp: Date.now() - 1000 };
    expect(verifyBridgePayload(expired, 'some-sig')).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const { payload: full, sig } = signBridgePayload(payload);
    full.userId = 'tampered';
    expect(verifyBridgePayload(full, sig)).toBe(false);
  });

  it('rejects a payload with missing userId', () => {
    const invalid = { userId: '', exp: Date.now() + 5000 } as BridgePayload;
    expect(verifyBridgePayload(invalid, 'sig')).toBe(false);
  });

  it('handles timingSafeEqual mismatch gracefully', () => {
    const valid = { userId: 'a', exp: Date.now() + 5000 } as BridgePayload;
    expect(verifyBridgePayload(valid, 'invalid-sig')).toBe(false);
  });
});
