import crypto from 'crypto';
import { AUTH_SECRET } from './constants';

export type BridgePayload = {
  userId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  exp: number;
};

export function signBridgePayload(payload: Omit<BridgePayload, 'exp'>, ttlMs = 60_000): { payload: BridgePayload; sig: string } {
  const full: BridgePayload = { ...payload, exp: Date.now() + ttlMs };
  const body = JSON.stringify(full);
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('hex');
  return { payload: full, sig };
}

export function verifyBridgePayload(payload: BridgePayload, sig: string): boolean {
  if (!payload?.userId || !payload.exp || payload.exp < Date.now()) return false;
  const body = JSON.stringify(payload);
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
