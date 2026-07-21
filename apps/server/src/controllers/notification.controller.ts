import { Response } from 'express';
import { and, eq, or } from 'drizzle-orm';
import { users, chatRequests } from '@connext/db';
import { isFcmConfigured, sendDataNotification } from '../lib/fcm';
import { getDb } from '../lib/constants';

export const sendPushNotification = async (req: any, res: Response) => {
  try {
    if (!isFcmConfigured()) {
      return res.status(500).json({ error: 'FCM is not configured' });
    }

    const { token, title, body, data } = req.body;
    if (!token || !title || !body) {
      return res.status(400).json({ error: 'token, title, and body are required' });
    }

    const senderId = req.user?.id;
    if (!senderId) {
      return res.status(401).json({ error: 'Unauthorized: No valid session' });
    }

    const db = getDb();
    const targetUser = await db.query.users.findFirst({
      where: eq(users.fcmToken, String(token)),
    });
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found for this device token' });
    }

    const chatConnection = await db.query.chatRequests.findFirst({
      where: and(
        or(
          and(
            eq(chatRequests.fromUserId, senderId),
            eq(chatRequests.toUserId, targetUser.id)
          ),
          and(
            eq(chatRequests.fromUserId, targetUser.id),
            eq(chatRequests.toUserId, senderId)
          )
        ),
        eq(chatRequests.status, 'accepted')
      ),
    });

    if (!chatConnection) {
      return res.status(403).json({
        error: 'Notifications can only be sent to users with an accepted chat connection',
      });
    }

    const messageId = await sendDataNotification({
      token: String(token),
      title: String(title),
      body: String(body),
      data: typeof data === 'object' && data ? data : {},
    });

    return res.status(200).json({ messageId });
  } catch (error) {
    console.error('Error in sendPushNotification:', error);
    return res.status(500).json({ error: 'Failed to send notification' });
  }
};
