import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq, or, ilike } from 'drizzle-orm';
import { users, hashPassword } from '@connext/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { getDb, JWT_SECRET, JWT_EXPIRES_DAYS } from '../lib/constants';
import { verifyBridgePayload, type BridgePayload } from '../lib/bridge';

function publicUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    displayName: row.displayName || row.name,
    avatarUrl: row.avatarUrl || row.image,
    lastSeenAt: row.lastSeenAt,
    hasPassword: Boolean(row.passwordHash),
  };
}

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

/** Called by Next.js after Auth.js login — mints API JWT cookie */
export const bridgeSession = async (req: AuthRequest, res: Response) => {
  try {
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
  } catch (error) {
    console.error('[bridgeSession]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSession = async (req: AuthRequest, res: Response) => {
  try {
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
  } catch (error) {
    console.error('[getSession]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (_req: AuthRequest, res: Response) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  return res.status(200).json({ ok: true });
};

export const updateUsername = async (req: AuthRequest, res: Response) => {
  try {
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

      // A password is required the first time a user reserves a username, so
      // they can later sign in with email + password.
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
        // Unique constraint race: another request claimed the same username first.
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
  } catch (error) {
    console.error('[updateUsername]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/** Set a new password for the authenticated user (used by the recovery flow). */
export const updatePassword = async (req: AuthRequest, res: Response) => {
  try {
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
  } catch (error) {
    console.error('[updatePassword]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateFcmToken = async (req: AuthRequest, res: Response) => {
  try {
    const { fcmToken } = req.body as { fcmToken?: string };
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const db = getDb();
    await db
      .update(users)
      .set({ fcmToken: fcmToken ?? null, updatedAt: new Date() })
      .where(eq(users.id, req.user.id));

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[updateFcmToken]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/** Search by username, email, or exact user id */
export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
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
  } catch (error) {
    console.error('[searchUsers]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserByQuery = async (req: AuthRequest, res: Response) => {
  return searchUsers(req, res);
};
