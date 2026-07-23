import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq, or } from 'drizzle-orm';
import {
  createDb,
  accounts,
  sessions,
  users,
  verificationTokens,
  emailCodeRateLimits,
  verifyPassword,
} from '@connext/db';
import crypto from 'crypto';

// Emailed sign-in codes are sent through Brevo's HTTPS API (port 443) rather
// than SMTP, because Railway blocks outbound SMTP ports (25/465/587). Tune the
// abuse guard + send timeout here.
const CODE_WINDOW_MS = 10 * 60 * 1000; // rolling window length
const CODE_MAX_PER_WINDOW = 10; // requests allowed per email per window
const BREVO_SEND_TIMEOUT_MS = 10_000; // fail fast instead of hanging the login UI

/** Split `"Connext <noreply@x.com>"` (or a bare address) into Brevo's sender shape. */
function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2].trim() };
  return { email: from.trim() };
}

/**
 * Sliding-window rate limit backed by the `email_code_rate_limit` table. Throws
 * when an email has already requested `CODE_MAX_PER_WINDOW` codes inside the
 * current window; the window rolls over once `CODE_WINDOW_MS` has elapsed.
 */
async function assertUnderRateLimit(dbInstance: NonNullable<typeof db>, identifier: string) {
  const now = new Date();
  const existing = await dbInstance.query.emailCodeRateLimits.findFirst({
    where: eq(emailCodeRateLimits.identifier, identifier),
  });

  if (!existing) {
    await dbInstance
      .insert(emailCodeRateLimits)
      .values({ identifier, count: 1, windowStart: now });
    return;
  }

  const windowExpired = now.getTime() - existing.windowStart.getTime() >= CODE_WINDOW_MS;
  if (windowExpired) {
    await dbInstance
      .update(emailCodeRateLimits)
      .set({ count: 1, windowStart: now })
      .where(eq(emailCodeRateLimits.identifier, identifier));
    return;
  }

  if (existing.count >= CODE_MAX_PER_WINDOW) {
    throw new Error('Too many code requests. Please wait a few minutes and try again.');
  }

  await dbInstance
    .update(emailCodeRateLimits)
    .set({ count: existing.count + 1 })
    .where(eq(emailCodeRateLimits.identifier, identifier));
}

const databaseUrl = process.env.DATABASE_URL;

const db = databaseUrl ? createDb(databaseUrl) : null;

const providers = [];

// Returning users sign in with email or username + password. Email users get
// their password during onboarding (after the emailed code); anonymous users
// pick a username + password at signup (/api/auth/signup) with no email at all.
if (db) {
  providers.push(
    Credentials({
      id: 'credentials',
      name: 'Email or username and password',
      credentials: {
        identifier: { label: 'Email or username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        const identifier = String(creds?.identifier ?? '')
          .trim()
          .toLowerCase();
        const password = String(creds?.password ?? '');
        if (!identifier || !password) return null;

        // Usernames can't contain '@', so one lookup covers both cases.
        const user = await db.query.users.findFirst({
          where: or(eq(users.email, identifier), eq(users.username, identifier)),
        });
        if (!user?.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    })
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { prompt: 'select_account' } },
    })
  );
}

if (process.env.BREVO_API_KEY) {
  const emailFrom = process.env.EMAIL_FROM || 'noreply@connext.local';
  providers.push(
    Nodemailer({
      // `server` is unused — we override sendVerificationRequest to send over
      // Brevo's HTTPS API instead of SMTP. It only needs to be a truthy value so
      // the provider initializes.
      server: { host: 'brevo-http-api', port: 443, auth: { user: 'x', pass: 'x' } },
      from: emailFrom,
      // Codes stay valid for 10 minutes — long enough to switch to your phone and back.
      maxAge: 10 * 60,
      // Produce a short numeric code instead of a long URL-safe token.
      generateVerificationToken() {
        return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      },
      // Send the code itself, not a clickable link, so login completes on the
      // device that started it (type the code from any device that got the email).
      async sendVerificationRequest({ identifier, token }) {
        // Guard against abuse before spending a send. Skipped only if the DB is
        // unavailable (db is null), in which case auth is already degraded.
        if (db) await assertUnderRateLimit(db, identifier);

        const brand = 'Connext';
        const sender = parseSender(emailFrom);

        // Abort a stalled request instead of hanging the login UI forever.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), BREVO_SEND_TIMEOUT_MS);
        try {
          const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'api-key': process.env.BREVO_API_KEY as string,
              'content-type': 'application/json',
              accept: 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              sender,
              to: [{ email: identifier }],
              subject: `${token} is your ${brand} sign-in code`,
              textContent: `Your ${brand} sign-in code is ${token}\n\nEnter it on the sign-in screen. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
              htmlContent: `
            <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#18181b">
              <h1 style="font-size:18px;margin:0 0 16px">Sign in to ${brand}</h1>
              <p style="font-size:14px;color:#52525b;margin:0 0 20px">Enter this code on the sign-in screen:</p>
              <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;background:#f4f4f5;border-radius:12px">${token}</div>
              <p style="font-size:13px;color:#71717a;margin:20px 0 0">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
            </div>`,
            }),
          });

          if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Brevo send failed (${res.status}): ${detail}`);
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new Error('Email service timed out. Please try again.');
          }
          throw err;
        } finally {
          clearTimeout(timer);
        }
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: db
    ? DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      })
    : undefined,
  // JWT sessions are required for the Credentials (password) provider.
  session: { strategy: 'jwt' },
  providers,
  pages: {
    signIn: '/login',
    verifyRequest: '/login/verify',
  },
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token?.sub as string) || '';
      }
      return session;
    },
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
  },
  trustHost: true,
});
