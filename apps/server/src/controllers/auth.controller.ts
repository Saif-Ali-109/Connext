import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq, or, ilike, and, gte, isNull, sql } from 'drizzle-orm';
import { users, verificationCodes, hashPassword } from '@connext/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { getDb, JWT_SECRET, JWT_EXPIRES_DAYS } from '../lib/constants';
import { verifyBridgePayload, type BridgePayload } from '../lib/bridge';
import { sendEmail } from '../lib/email';
import { asyncHandler } from '../lib/asyncHandler';
import { publicUser } from '../lib/user';
import crypto from 'crypto';

function setAuthCookie(res: Response, user: { id: string; email?: string | null; name?: string | null }) {
  const token = jwt.sign(
    { id: user.id, email: user.email ?? null, name: user.name ?? null },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_DAYS as jwt.SignOptions['expiresIn'] }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return token;
}

export const bridgeSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { payload, sig } = req.body as { payload?: BridgePayload; sig?: string };
  if (!payload || !sig || !verifyBridgePayload(payload, sig)) {
    return res.status(401).json({ error: 'Invalid bridge signature' });
  }

  const db = getDb();
  const existing = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

  let user = existing;
  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        id: payload.userId,
        email: payload.email ?? null,
        name: payload.name ?? null,
        image: payload.image ?? null,
        displayName: payload.name ?? null,
        avatarUrl: payload.image ?? null,
      })
      .returning();
    user = created;
  } else {
    const [updated] = await db
      .update(users)
      .set({
        email: payload.email ?? user.email,
        name: payload.name ?? user.name,
        image: payload.image ?? user.image,
        updatedAt: new Date(),
        lastSeenAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    user = updated;
  }

  setAuthCookie(res, user);
  return res.status(200).json({ user: publicUser(user) });
});

export const getSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, req.user.id),
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json({ user: publicUser(user) });
});

export const logout = async (_req: AuthRequest, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  return res.status(200).json({ ok: true });
};

export const updateUsername = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { username, displayName, password } = req.body as {
    username?: string;
    displayName?: string;
    password?: string;
  };

  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (username) {
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
      return res.status(400).json({
        error: 'Username must be 3-24 chars: lowercase letters, numbers, underscore',
      });
    }

    const db = getDb();

    const existing = await db.query.users.findFirst({
      where: eq(users.id, req.user.id),
    });
    let passwordHash: string | undefined;
    if (!existing?.passwordHash) {
      if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      passwordHash = await hashPassword(password);
    }

    const taken = await db.query.users.findFirst({
      where: eq(users.username, normalized),
    });
    if (taken && taken.id !== req.user.id) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    try {
      const [updated] = await db
        .update(users)
        .set({
          username: normalized,
          displayName: displayName?.trim() || normalized,
          ...(passwordHash ? { passwordHash } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.user.id))
        .returning();

      return res.status(200).json({ user: publicUser(updated) });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Username already taken' });
      }
      throw err;
    }
  }

  if (displayName) {
    const db = getDb();
    const [updated] = await db
      .update(users)
      .set({ displayName: displayName.trim(), updatedAt: new Date() })
      .where(eq(users.id, req.user.id))
      .returning();
    return res.status(200).json({ user: publicUser(updated) });
  }

  return res.status(400).json({ error: 'username or displayName required' });
});

export const updatePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const passwordHash = await hashPassword(password);
  const [updated] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, req.user.id))
    .returning();

  return res.status(200).json({ user: publicUser(updated) });
});

const VERIFICATION_CODE_WINDOW_MS = 10 * 60 * 1000;
const VERIFICATION_CODE_MAX_PER_WINDOW = 3;

export const sendVerificationEmail = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  if (
    !email ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/i.test(email)
  ) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const db = getDb();
  const tenMinAgo = new Date(Date.now() - VERIFICATION_CODE_WINDOW_MS);
  const recent = await db
    .select({ count: sql<number>`count(*)` })
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.userId, req.user.id),
        gte(verificationCodes.createdAt, tenMinAgo)
      )
    );

  const count = Number(recent[0]?.count ?? 0);
  if (count >= VERIFICATION_CODE_MAX_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(verificationCodes).values({
    userId: req.user.id,
    email,
    code,
    type: 'email_verification',
    expiresAt,
  });

  await sendEmail({
    to: email,
    subject: 'Verify your email on Connext',
    textContent: `Your verification code is ${code}\n\nEnter it in the app to verify your email. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    htmlContent: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#18181b">
      <h1 style="font-size:18px;margin:0 0 16px">Verify your email</h1>
      <p style="font-size:14px;color:#52525b;margin:0 0 20px">Enter this code in the app to verify your email:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;background:#f4f4f5;border-radius:12px">${code}</div>
      <p style="font-size:13px;color:#71717a;margin:20px 0 0">This code expires in 10 minutes.</p>
    </div>`,
  });

  return res.status(200).json({ ok: true });
});

export const verifyEmail = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, code } = req.body as { email?: string; code?: string };
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required' });
  }

  const db = getDb();
  const existing = await db.query.verificationCodes.findFirst({
    where: and(
      eq(verificationCodes.userId, req.user.id),
      eq(verificationCodes.email, email),
      eq(verificationCodes.code, code),
      eq(verificationCodes.type, 'email_verification'),
      isNull(verificationCodes.usedAt),
      gte(verificationCodes.expiresAt, new Date())
    ),
  });

  if (!existing) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  await db
    .update(verificationCodes)
    .set({ usedAt: new Date() })
    .where(eq(verificationCodes.id, existing.id));

  const [updated] = await db
    .update(users)
    .set({
      email,
      emailVerified: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, req.user.id))
    .returning();

  return res.status(200).json({ user: publicUser(updated) });
});

export const updateFcmToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { fcmToken } = req.body as { fcmToken?: string };
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb();
  await db
    .update(users)
    .set({ fcmToken: fcmToken ?? null, updatedAt: new Date() })
    .where(eq(users.id, req.user.id));

  return res.status(200).json({ ok: true });
});

export const searchUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const q = String(req.query.q || req.params.query || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const db = getDb();

  const byId = await db.query.users.findFirst({ where: eq(users.id, q) });
  if (byId) {
    return res.status(200).json(publicUser(byId));
  }

  const matches = await db
    .select()
    .from(users)
    .where(or(ilike(users.username, `%${q}%`), ilike(users.email, `%${q}%`)))
    .limit(10);

  if (matches.length === 1) {
    return res.status(200).json(publicUser(matches[0]));
  }

  return res.status(200).json({ users: matches.map(publicUser) });
});

export const getUserByQuery = asyncHandler(async (req: AuthRequest, res: Response) => {
  const q = String(req.query.q || req.params.query || '').trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  const db = getDb();

  const byId = await db.query.users.findFirst({ where: eq(users.id, q) });
  if (byId) {
    return res.status(200).json(publicUser(byId));
  }

  const matches = await db
    .select()
    .from(users)
    .where(or(ilike(users.username, `%${q}%`), ilike(users.email, `%${q}%`)))
    .limit(10);

  if (matches.length === 1) {
    return res.status(200).json(publicUser(matches[0]));
  }

  return res.status(200).json({ users: matches.map(publicUser) });
});
