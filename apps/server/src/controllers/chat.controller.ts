import { Response } from 'express';
import { and, eq, or, ne, count, desc } from 'drizzle-orm';
import {
  users,
  messages,
  chatRequests,
  invites,
  getRoomId,
  isParticipantRoomId,
} from '@connext/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { getDb } from '../lib/constants';
import crypto from 'crypto';

const getAuthenticatedUserId = (req: AuthRequest): string =>
  String(req.user?.id || '');

const publicUser = (row: typeof users.$inferSelect) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  username: row.username,
  displayName: row.displayName || row.name,
  avatarUrl: row.avatarUrl || row.image,
  publicKey: row.publicKey,
});

const isHiddenBy = (hiddenBy: string[] | null | undefined, userId: string) =>
  (hiddenBy ?? []).includes(userId);

export const sendRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { toUserId, toUsername } = req.body as {
      fromUserId?: string;
      toUserId?: string;
      toUsername?: string;
      toPublicKey?: string; // legacy alias
    };
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const db = getDb();
    const fromUser = await db.query.users.findFirst({
      where: eq(users.id, authenticatedUserId),
    });
    if (!fromUser) return res.status(404).json({ error: 'Sender not found' });

    const lookup = toUserId || toUsername || req.body.toPublicKey;
    if (!lookup) {
      return res.status(400).json({ error: 'Recipient is required' });
    }

    let toUser =
      (await db.query.users.findFirst({ where: eq(users.id, String(lookup)) })) ||
      (await db.query.users.findFirst({
        where: eq(users.username, String(lookup).toLowerCase()),
      }));

    if (!toUser) {
      return res.status(404).json({ error: 'Recipient not found on this platform' });
    }

    if (fromUser.id === toUser.id) {
      return res.status(400).json({ error: 'Cannot send request to yourself' });
    }

    const existing = await db.query.chatRequests.findFirst({
      where: or(
        and(eq(chatRequests.fromUserId, fromUser.id), eq(chatRequests.toUserId, toUser.id)),
        and(eq(chatRequests.fromUserId, toUser.id), eq(chatRequests.toUserId, fromUser.id))
      ),
    });

    if (existing) {
      if (isHiddenBy(existing.hiddenBy, fromUser.id)) {
        const [updated] = await db
          .update(chatRequests)
          .set({
            status: 'pending',
            fromUserId: fromUser.id,
            toUserId: toUser.id,
            hiddenBy: [],
            updatedAt: new Date(),
          })
          .where(eq(chatRequests.id, existing.id))
          .returning();
        return res.status(200).json({ message: 'Request re-opened', request: updated });
      }

      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Chat already accepted' });
      }

      if (existing.status === 'pending') {
        if (existing.toUserId === fromUser.id) {
          const [updated] = await db
            .update(chatRequests)
            .set({ status: 'accepted', updatedAt: new Date() })
            .where(eq(chatRequests.id, existing.id))
            .returning();
          return res.status(200).json({
            message: 'Mutual request found, chat automatically accepted',
            request: updated,
          });
        }
        return res.status(400).json({ error: 'Request already pending' });
      }

      const [updated] = await db
        .update(chatRequests)
        .set({
          status: 'pending',
          fromUserId: fromUser.id,
          toUserId: toUser.id,
          hiddenBy: [],
          updatedAt: new Date(),
        })
        .where(eq(chatRequests.id, existing.id))
        .returning();
      return res.status(200).json(updated);
    }

    const [newRequest] = await db
      .insert(chatRequests)
      .values({
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        status: 'pending',
      })
      .returning();

    return res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error in sendRequest:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const respondToRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId, status } = req.body as {
      requestId?: string;
      status?: string;
    };
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (!status || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const db = getDb();
    const chatReq = await db.query.chatRequests.findFirst({
      where: eq(chatRequests.id, String(requestId)),
    });
    if (!chatReq) return res.status(404).json({ error: 'Request not found' });

    if (chatReq.toUserId !== authenticatedUserId) {
      return res.status(403).json({ error: 'Forbidden: only the request recipient can respond' });
    }

    const [updated] = await db
      .update(chatRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(chatRequests.id, chatReq.id))
      .returning();

    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error in respondToRequest:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRequests = async (req: AuthRequest, res: Response) => {
  try {
    const authenticatedUserId = getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const db = getDb();
    const all = await db.select().from(chatRequests).where(
      or(
        eq(chatRequests.fromUserId, authenticatedUserId),
        eq(chatRequests.toUserId, authenticatedUserId)
      )
    );

    const userIds = new Set<string>();
    for (const r of all) {
      userIds.add(r.fromUserId);
      userIds.add(r.toUserId);
    }

    const userMap = new Map<string, ReturnType<typeof publicUser>>();
    for (const id of userIds) {
      const u = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (u) userMap.set(id, publicUser(u));
    }

    const hydrate = (r: typeof chatRequests.$inferSelect) => ({
      ...r,
      from: userMap.get(r.fromUserId),
      to: userMap.get(r.toUserId),
      // legacy-shaped fields for older UI
      fromWallet: r.fromUserId,
      toWallet: r.toUserId,
    });

    const visible = all.filter((r) => !isHiddenBy(r.hiddenBy, authenticatedUserId));

    const incoming = visible
      .filter((r) => r.toUserId === authenticatedUserId && r.status === 'pending')
      .map(hydrate);
    const outgoing = visible
      .filter((r) => r.fromUserId === authenticatedUserId && r.status === 'pending')
      .map(hydrate);
    const contacts = visible
      .filter((r) => r.status === 'accepted')
      .map(hydrate);

    return res.status(200).json({ incoming, outgoing, contacts });
  } catch (error) {
    console.error('Error in getRequests:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (!roomId || !isParticipantRoomId(roomId, authenticatedUserId)) {
      return res.status(400).json({ error: 'Invalid Room ID' });
    }

    const db = getDb();
    const parts = roomId.split('_');
    const otherId = parts.find((p) => p !== authenticatedUserId);
    if (!otherId) {
      return res.status(400).json({ error: 'Invalid Room ID' });
    }

    const connection = await db.query.chatRequests.findFirst({
      where: and(
        or(
          and(
            eq(chatRequests.fromUserId, authenticatedUserId),
            eq(chatRequests.toUserId, otherId)
          ),
          and(
            eq(chatRequests.fromUserId, otherId),
            eq(chatRequests.toUserId, authenticatedUserId)
          )
        ),
        eq(chatRequests.status, 'accepted')
      ),
    });

    if (!connection || isHiddenBy(connection.hiddenBy, authenticatedUserId)) {
      return res.status(403).json({ error: 'Forbidden: no accepted connection for this room' });
    }

    // Opening the conversation marks the other participant's messages as read.
    await db
      .update(messages)
      .set({ read: true })
      .where(
        and(
          eq(messages.roomId, roomId),
          ne(messages.senderId, authenticatedUserId),
          eq(messages.read, false)
        )
      );

    const pageNum = parseInt(req.query.page as string) || 1;
    const limitNum = parseInt(req.query.limit as string) || 20;
    const offset = (pageNum - 1) * limitNum;

    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(messages)
      .where(eq(messages.roomId, roomId));

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.timestamp))
      .limit(limitNum)
      .offset(offset);

    const formattedMessages = rows.map((msg) => ({
      id: msg.id,
      sender: msg.senderId === authenticatedUserId ? 'me' : 'other',
      text: msg.content || msg.encryptedContent || '',
      encryptedContentForSender: msg.encryptedContentForSender,
      createdAt: msg.timestamp,
      deliveryState: msg.read ? 'read' : msg.deliveredAt ? 'delivered' : 'sent',
    }));

    return res.status(200).json({
      messages: formattedMessages,
      totalCount: Number(totalCount),
      page: pageNum,
      limit: limitNum,
      hasMore: offset + rows.length < Number(totalCount),
    });
  } catch (error) {
    console.error('Error in getMessages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const {
      senderId,
      recipientUserId,
      content,
      encryptedContent,
      encryptedContentForSender,
    } = req.body as {
      senderId?: string;
      recipientUserId?: string;
      recipientPublicKey?: string;
      content?: string;
      encryptedContent?: string;
      encryptedContentForSender?: string;
    };

    const authenticatedUserId = getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (senderId && String(senderId) !== authenticatedUserId) {
      return res.status(403).json({ error: 'Forbidden: sender does not match authenticated session' });
    }

    const recipientLookup = recipientUserId || req.body.recipientPublicKey;
    if (!recipientLookup) {
      return res.status(400).json({ error: 'recipientUserId is required' });
    }

    const bodyText = content || encryptedContent;
    if (!bodyText) {
      return res.status(400).json({ error: 'content is required' });
    }

    const db = getDb();
    const recipient =
      (await db.query.users.findFirst({ where: eq(users.id, String(recipientLookup)) })) ||
      (await db.query.users.findFirst({
        where: eq(users.username, String(recipientLookup).toLowerCase()),
      }));

    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    const request = await db.query.chatRequests.findFirst({
      where: and(
        or(
          and(
            eq(chatRequests.fromUserId, authenticatedUserId),
            eq(chatRequests.toUserId, recipient.id)
          ),
          and(
            eq(chatRequests.fromUserId, recipient.id),
            eq(chatRequests.toUserId, authenticatedUserId)
          )
        ),
        eq(chatRequests.status, 'accepted')
      ),
    });

    if (!request) {
      return res.status(403).json({ error: 'No accepted connection between these users' });
    }

    const roomId = getRoomId(authenticatedUserId, recipient.id);

    const [newMessage] = await db
      .insert(messages)
      .values({
        senderId: authenticatedUserId,
        roomId,
        content: content || bodyText,
        encryptedContent: encryptedContent || null,
        encryptedContentForSender: encryptedContentForSender || null,
      })
      .returning();

    return res.status(202).json({
      roomId,
      messageId: newMessage.id,
      message: 'Message persisted to database.',
    });
  } catch (error) {
    console.error('[REST sendMessage] CRITICAL ERROR:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    const authenticatedUserId = getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const db = getDb();
    const chatReq = await db.query.chatRequests.findFirst({
      where: eq(chatRequests.id, requestId),
    });
    if (!chatReq) return res.status(404).json({ error: 'Request not found' });

    if (
      chatReq.fromUserId !== authenticatedUserId &&
      chatReq.toUserId !== authenticatedUserId
    ) {
      return res.status(403).json({ error: 'Forbidden: you are not part of this request' });
    }

    await db.delete(chatRequests).where(eq(chatRequests.id, requestId));
    return res.status(200).json({ message: 'Connection removed successfully' });
  } catch (error) {
    console.error('Error in removeRequest:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUnreadMessageCounts = async (req: AuthRequest, res: Response) => {
  try {
    const authenticatedUserId = getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const db = getDb();
    const accepted = await db
      .select()
      .from(chatRequests)
      .where(
        and(
          or(
            eq(chatRequests.fromUserId, authenticatedUserId),
            eq(chatRequests.toUserId, authenticatedUserId)
          ),
          eq(chatRequests.status, 'accepted')
        )
      );

    const unreadCounts: Record<string, number> = {};

    for (const request of accepted) {
      const otherUserId =
        request.fromUserId === authenticatedUserId
          ? request.toUserId
          : request.fromUserId;
      const roomId = getRoomId(authenticatedUserId, otherUserId);

      const [{ value }] = await db
        .select({ value: count() })
        .from(messages)
        .where(
          and(
            eq(messages.roomId, roomId),
            ne(messages.senderId, authenticatedUserId),
            eq(messages.read, false)
          )
        );

      if (Number(value) > 0) {
        unreadCounts[otherUserId] = Number(value);
      }
    }

    return res.status(200).json(unreadCounts);
  } catch (error) {
    console.error('Error in getUnreadMessageCounts:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateContactName = async (req: AuthRequest, res: Response) => {
  try {
    const { contactUserId, customName } = req.body as {
      contactUserId?: string;
      customName?: string;
    };
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }
    if (!contactUserId) {
      return res.status(400).json({ error: 'Contact user ID is required' });
    }

    const db = getDb();
    const chatReq = await db.query.chatRequests.findFirst({
      where: and(
        or(
          and(
            eq(chatRequests.fromUserId, authenticatedUserId),
            eq(chatRequests.toUserId, contactUserId)
          ),
          and(
            eq(chatRequests.fromUserId, contactUserId),
            eq(chatRequests.toUserId, authenticatedUserId)
          )
        ),
        eq(chatRequests.status, 'accepted')
      ),
    });

    if (!chatReq) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const patch =
      chatReq.fromUserId === authenticatedUserId
        ? { fromCustomName: customName }
        : { toCustomName: customName };

    await db
      .update(chatRequests)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(chatRequests.id, chatReq.id));

    return res.status(200).json({ message: 'Contact name updated successfully', customName });
  } catch (error) {
    console.error('Error in updateContactName:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const disconnectChat = async (req: AuthRequest, res: Response) => {
  try {
    const { contactUserId } = req.body as { contactUserId?: string };
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }
    if (!contactUserId) {
      return res.status(400).json({ error: 'Contact user ID is required' });
    }

    const db = getDb();
    const chatReq = await db.query.chatRequests.findFirst({
      where: or(
        and(
          eq(chatRequests.fromUserId, authenticatedUserId),
          eq(chatRequests.toUserId, contactUserId)
        ),
        and(
          eq(chatRequests.fromUserId, contactUserId),
          eq(chatRequests.toUserId, authenticatedUserId)
        )
      ),
    });

    if (!chatReq) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const hiddenBy = new Set(chatReq.hiddenBy ?? []);
    hiddenBy.add(authenticatedUserId);

    await db
      .update(chatRequests)
      .set({ hiddenBy: Array.from(hiddenBy), updatedAt: new Date() })
      .where(eq(chatRequests.id, chatReq.id));

    return res.status(200).json({ message: 'Disconnected successfully' });
  } catch (error) {
    console.error('Error in disconnectChat:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createInvite = async (req: AuthRequest, res: Response) => {
  try {
    const authenticatedUserId = getAuthenticatedUserId(req);
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const db = getDb();

    const [invite] = await db
      .insert(invites)
      .values({
        token,
        createdById: authenticatedUserId,
        expiresAt,
      })
      .returning();

    return res.status(201).json({ invite });
  } catch (error) {
    console.error('[createInvite]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptInvite = async (req: AuthRequest, res: Response) => {
  try {
    const authenticatedUserId = getAuthenticatedUserId(req);
    const { token } = req.body as { token?: string };

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!token) {
      return res.status(400).json({ error: 'token required' });
    }

    const db = getDb();
    const invite = await db.query.invites.findFirst({
      where: eq(invites.token, token),
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Invite expired' });
    }
    if (invite.createdById === authenticatedUserId) {
      return res.status(400).json({ error: 'Cannot accept your own invite' });
    }

    // Upsert accepted chat request
    const existing = await db.query.chatRequests.findFirst({
      where: or(
        and(
          eq(chatRequests.fromUserId, invite.createdById),
          eq(chatRequests.toUserId, authenticatedUserId)
        ),
        and(
          eq(chatRequests.fromUserId, authenticatedUserId),
          eq(chatRequests.toUserId, invite.createdById)
        )
      ),
    });

    let request = existing;
    if (existing) {
      const [updated] = await db
        .update(chatRequests)
        .set({ status: 'accepted', hiddenBy: [], updatedAt: new Date() })
        .where(eq(chatRequests.id, existing.id))
        .returning();
      request = updated;
    } else {
      const [created] = await db
        .insert(chatRequests)
        .values({
          fromUserId: invite.createdById,
          toUserId: authenticatedUserId,
          status: 'accepted',
        })
        .returning();
      request = created;
    }

    await db
      .update(invites)
      .set({ acceptedById: authenticatedUserId })
      .where(eq(invites.id, invite.id));

    const roomId = getRoomId(invite.createdById, authenticatedUserId);
    return res.status(200).json({ request, roomId, otherUserId: invite.createdById });
  } catch (error) {
    console.error('[acceptInvite]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

let onlineSocketsByUserIdRef: Map<string, Set<string>>;

export const setOnlineSocketsRef = (ref: Map<string, Set<string>>) => {
  onlineSocketsByUserIdRef = ref;
};

export const getOnlineStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const isOnline = (onlineSocketsByUserIdRef?.get(userId)?.size ?? 0) > 0;
    return res.status(200).json({ userId, online: !!isOnline });
  } catch (error) {
    console.error('Error in getOnlineStatus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
