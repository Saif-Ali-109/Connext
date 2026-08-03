import { Response } from 'express';
import { and, eq, or } from 'drizzle-orm';
import { users, chatRequests, isHiddenBy } from '@connext/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { getDb } from '../lib/constants';
import { asyncHandler } from '../lib/asyncHandler';
import { sendSuccess, sendError } from '../lib/response';

export const sendPushNotification = asyncHandler(async (req: any, res: Response) => {
  const { userId, title, body } = req.body as { userId?: string; title?: string; body?: string };
  const senderUserId = req.user?.id;

  if (!senderUserId || !userId || !title || !body) {
    return sendError(res, 'Missing required fields', 400);
  }

  const db = getDb();
  const recipient = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!recipient?.fcmToken) {
    return sendError(res, 'Recipient has no FCM token', 400);
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

  if (!connection || isHiddenBy(connection.hiddenBy, senderUserId)) {
    return sendError(res, 'No accepted chat connection between these users', 403);
  }

  const admin = await import('firebase-admin');
  await admin.messaging().send({
    token: recipient.fcmToken,
    notification: { title, body },
    data: { senderUserId },
  });

  return sendSuccess(res, { ok: true });
});
