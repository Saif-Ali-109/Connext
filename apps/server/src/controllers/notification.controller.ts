import { Response } from 'express';
import { and, eq, or } from 'drizzle-orm';
import { users, chatRequests } from '@connext/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { getDb } from '../lib/constants';
import { asyncHandler } from '../lib/asyncHandler';

export const sendPushNotification = asyncHandler(async (req: any, res: Response) => {
  const { userId, title, body } = req.body as { userId?: string; title?: string; body?: string };
  const senderUserId = req.user?.id;

  if (!senderUserId || !userId || !title || !body) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = getDb();
  const recipient = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!recipient?.fcmToken) {
    return res.status(400).json({ error: 'Recipient has no FCM token' });
  }

  const connection = await db.query.chatRequests.findFirst({
    where: and(
      or(
        and(eq(chatRequests.fromUserId, senderUserId), eq(chatRequests.toUserId, userId)),
        and(eq(chatRequests.fromUserId, userId), eq(chatRequests.toUserId, senderUserId))
      ),
      eq(chatRequests.status, 'accepted')
    ),
  });

  if (!connection) {
    return res.status(403).json({ error: 'No accepted chat connection between these users' });
  }

  const admin = await import('firebase-admin');
  await admin.messaging().send({
    token: recipient.fcmToken,
    notification: { title, body },
    data: { senderUserId },
  });

  return res.status(200).json({ ok: true });
});
