import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import crypto from 'crypto';

/** Returns a short-lived signed payload the client posts to Express /auth/bridge */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const secret =
    process.env.AUTH_SECRET || process.env.JWT_SECRET || 'dev_jwt_secret_change_me';

  const payload = {
    userId: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    exp: Date.now() + 60_000,
  };

  const sig = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return NextResponse.json({ payload, sig });
}
