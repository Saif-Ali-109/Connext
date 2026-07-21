import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq, or } from 'drizzle-orm';
import { createDb, accounts, sessions, users, verificationTokens, verifyPassword } from '@connext/db';
import { createTransport } from 'nodemailer';
import crypto from 'crypto';

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

if (process.env.EMAIL_SERVER) {
  providers.push(
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM || 'noreply@connext.local',
      // Codes stay valid for 10 minutes — long enough to switch to your phone and back.
      maxAge: 10 * 60,
      // Produce a short numeric code instead of a long URL-safe token.
      generateVerificationToken() {
        return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      },
      // Send the code itself, not a clickable link, so login completes on the
      // device that started it (type the code from any device that got the email).
      async sendVerificationRequest({ identifier, token, provider }) {
        const transport = createTransport(provider.server);
        const brand = 'Connext';
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: `${token} is your ${brand} sign-in code`,
          text: `Your ${brand} sign-in code is ${token}\n\nEnter it on the sign-in screen. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
          html: `
            <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#18181b">
              <h1 style="font-size:18px;margin:0 0 16px">Sign in to ${brand}</h1>
              <p style="font-size:14px;color:#52525b;margin:0 0 20px">Enter this code on the sign-in screen:</p>
              <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;background:#f4f4f5;border-radius:12px">${token}</div>
              <p style="font-size:13px;color:#71717a;margin:20px 0 0">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
            </div>`,
        });
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
