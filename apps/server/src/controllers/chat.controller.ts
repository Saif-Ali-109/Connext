import { Response } from 'express';
import { and, eq, or, ne, count, desc, inArray, sql, gt, isNull } from 'drizzle-orm';
import {
  users,
  messages,
  chatRequests,
  chatClears,
  invites,
  getRoomId,
  isParticipantRoomId,
  isHiddenBy,
  MESSAGE_MAX_LENGTH,
} from '@connext/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { getDb } from '../lib/constants';
import { asyncHandler } from '../lib/asyncHandler';
import { sendSuccess, sendError } from '../lib/response';
import { publicUser } from '../lib/user';
import { toggleReaction as toggleMessageReaction, ReactionError } from '../lib/reactions';
import crypto from 'crypto';

const TTL = 30_000;
const requestCache = new Map<string, { data: unknown; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCache) {
    if (entry.expiresAt < now) requestCache.delete(key);
  }
}, TTL);

function invalidateRequestCache(...userIds: string[]) {
  for (const id of userIds) {
    requestCache.delete(id);
  }
}

const getAuthenticatedUserId = (req: AuthRequest): string =>
  String(req.user?.id || '');

export const sendRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { toUserId, toUsername } = req.body as {
    fromUserId?: string;
    toUserId?: string;
    toUsername?: string;
  };
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  const db = getDb();
  const fromUser = await db.query.users.findFirst({
    where: eq(users.id, authenticatedUserId),
  });
  if (!fromUser) return sendError(res, 'Sender not found', 404);

  const lookup = toUserId || toUsername;
  if (!lookup) {
    return sendError(res, 'Recipient is required', 400);
  }

  let toUser =
    (await db.query.users.findFirst({ where: eq(users.id, String(lookup)) })) ||
    (await db.query.users.findFirst({
      where: eq(users.username, String(lookup).toLowerCase()),
    }));

  if (!toUser) {
    return sendError(res, 'Recipient not found on this platform', 404);
  }

  if (fromUser.id === toUser.id) {
    return sendError(res, 'Cannot send request to yourself', 400);
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
      invalidateRequestCache(fromUser.id, toUser.id);
      return sendSuccess(res, { message: 'Request re-opened', request: updated });
    }

    if (existing.status === 'accepted') {
      return sendError(res, 'Chat already accepted', 400);
    }

    if (existing.status === 'pending') {
      if (existing.toUserId === fromUser.id) {
        const [updated] = await db
          .update(chatRequests)
          .set({ status: 'accepted', updatedAt: new Date() })
          .where(eq(chatRequests.id, existing.id))
          .returning();
        invalidateRequestCache(fromUser.id, toUser.id);
        return sendSuccess(res, {
          message: 'Mutual request found, chat automatically accepted',
          request: updated,
        });
      }
      return sendError(res, 'Request already pending', 400);
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
    invalidateRequestCache(fromUser.id, toUser.id);
    return sendSuccess(res, { request: updated });
  }

  const [newRequest] = await db
    .insert(chatRequests)
    .values({
      fromUserId: fromUser.id,
      toUserId: toUser.id,
      status: 'pending',
    })
    .returning();

  invalidateRequestCache(fromUser.id, toUser.id);
  return sendSuccess(res, { request: newRequest }, 201);
});

export const respondToRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { requestId, status } = req.body as {
    requestId?: string;
    status?: string;
  };
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  if (!status || !['accepted', 'rejected'].includes(status)) {
    return sendError(res, 'Invalid status', 400);
  }

  const db = getDb();
  const chatReq = await db.query.chatRequests.findFirst({
    where: eq(chatRequests.id, String(requestId)),
  });
  if (!chatReq) return sendError(res, 'Request not found', 404);

  if (chatReq.toUserId !== authenticatedUserId) {
    return sendError(res, 'Forbidden: only the request recipient can respond', 403);
  }

  const [updated] = await db
    .update(chatRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(chatRequests.id, chatReq.id))
    .returning();

  invalidateRequestCache(authenticatedUserId, chatReq.fromUserId);
  return sendSuccess(res, { request: updated });
});

export const getRequests = asyncHandler(async (req: AuthRequest, res: Response) => {
  const authenticatedUserId = getAuthenticatedUserId(req);
  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  const cached = requestCache.get(authenticatedUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return sendSuccess(res, cached.data as Record<string, unknown>);
  }

  const db = getDb();
  const all = await db.select().from(chatRequests).where(
    or(
      eq(chatRequests.fromUserId, authenticatedUserId),
      eq(chatRequests.toUserId, authenticatedUserId)
    )
  );

  const userIds = [...new Set(all.flatMap((r) => [r.fromUserId, r.toUserId]))];

  const userRows = userIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  const userMap = new Map<string, ReturnType<typeof publicUser>>(
    userRows.map((u) => [u.id, publicUser(u)])
  );

  const hydrate = (r: typeof chatRequests.$inferSelect) => ({
    ...r,
    from: userMap.get(r.fromUserId),
    to: userMap.get(r.toUserId),
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

  const data = { incoming, outgoing, contacts };
  requestCache.set(authenticatedUserId, { data, expiresAt: Date.now() + TTL });
  return sendSuccess(res, data);
});

export const getMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params;
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  if (!roomId || !isParticipantRoomId(roomId, authenticatedUserId)) {
    return sendError(res, 'Invalid Room ID', 400);
  }

  const db = getDb();
  const parts = roomId.split('_');
  const otherId = parts.find((p) => p !== authenticatedUserId);
  if (!otherId) {
    return sendError(res, 'Invalid Room ID', 400);
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
    return sendError(res, 'Forbidden: no accepted connection for this room', 403);
  }

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

  const clearRow = await db.query.chatClears.findFirst({
    where: and(eq(chatClears.userId, authenticatedUserId), eq(chatClears.roomId, roomId)),
  });

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      content: messages.content,
      encryptedContent: messages.encryptedContent,
      encryptedContentForSender: messages.encryptedContentForSender,
      senderKeyFingerprint: messages.senderKeyFingerprint,
      read: messages.read,
      reaction: messages.reaction,
      reactedByUserId: messages.reactedByUserId,
      deliveredAt: messages.deliveredAt,
      timestamp: messages.timestamp,
      totalCount: sql<number>`count(*) over()`,
    })
    .from(messages)
    .where(and(eq(messages.roomId, roomId), clearRow ? gt(messages.timestamp, clearRow.clearedAt) : undefined))
    .orderBy(desc(messages.timestamp))
    .limit(limitNum)
    .offset(offset);

  const totalCount = rows.length > 0 ? Number(rows[0].totalCount) : 0;

  const formattedMessages = rows.map((msg) => ({
    id: msg.id,
    sender: msg.senderId === authenticatedUserId ? 'me' : 'other',
    text: msg.content || '',
    encryptedContent: msg.encryptedContent ?? null,
    encryptedContentForSender: msg.encryptedContentForSender ?? null,
    senderKeyFingerprint: msg.senderKeyFingerprint ?? null,
    reaction: msg.reaction ?? null,
    reactedByUserId: msg.reactedByUserId ?? null,
    createdAt: msg.timestamp,
    deliveryState: msg.read ? 'read' : msg.deliveredAt ? 'delivered' : 'sent',
  }));

  return sendSuccess(res, {
    messages: formattedMessages,
    totalCount: Number(totalCount),
    page: pageNum,
    limit: limitNum,
    hasMore: offset + rows.length < Number(totalCount),
  });
});

export const clearChatHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params;
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  if (!roomId || !isParticipantRoomId(roomId, authenticatedUserId)) {
    return sendError(res, 'Invalid Room ID', 400);
  }

  const parts = roomId.split('_');
  const otherId = parts.find((p) => p !== authenticatedUserId);
  if (!otherId) {
    return sendError(res, 'Invalid Room ID', 400);
  }

  const db = getDb();
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
    return sendError(res, 'Forbidden: no accepted connection for this room', 403);
  }

  invalidateRequestCache(authenticatedUserId, otherId);

  await db.delete(messages).where(eq(messages.roomId, roomId));
  return sendSuccess(res, { ok: true });
});

export const clearChatForUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params;
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  if (!roomId || !isParticipantRoomId(roomId, authenticatedUserId)) {
    return sendError(res, 'Invalid Room ID', 400);
  }

  const parts = roomId.split('_');
  const otherId = parts.find((p) => p !== authenticatedUserId);
  if (!otherId) {
    return sendError(res, 'Invalid Room ID', 400);
  }

  const db = getDb();
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
    return sendError(res, 'Forbidden: no accepted connection for this room', 403);
  }

  await db
    .insert(chatClears)
    .values({ userId: authenticatedUserId, roomId, clearedAt: new Date() })
    .onConflictDoUpdate({
      target: [chatClears.userId, chatClears.roomId],
      set: { clearedAt: new Date() },
    });

  return sendSuccess(res, { ok: true });
});

export const toggleReaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const authenticatedUserId = getAuthenticatedUserId(req);
  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  const { messageId, emoji } = req.body as { messageId?: string; emoji?: string };
  if (!messageId || typeof emoji !== 'string') {
    return sendError(res, 'messageId and emoji are required', 400);
  }

  try {
    const result = await toggleMessageReaction({ userId: authenticatedUserId, messageId, emoji });
    return sendSuccess(res, result);
  } catch (err) {
    if (err instanceof ReactionError) {
      return sendError(res, err.message, err.status);
    }
    throw err;
  }
});

export const sendMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    senderId,
    recipientUserId,
    content,
    encryptedContent,
    encryptedContentForSender,
    senderKeyFingerprint,
  } = req.body as {
    senderId?: string;
    recipientUserId?: string;
    recipientPublicKey?: string;
    content?: string;
    encryptedContent?: string;
    encryptedContentForSender?: string;
    senderKeyFingerprint?: string;
  };

  const authenticatedUserId = getAuthenticatedUserId(req);
  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized', 401);
  }

  if (senderId && String(senderId) !== authenticatedUserId) {
    return sendError(res, 'Forbidden: sender does not match authenticated session', 403);
  }

  const recipientLookup = recipientUserId || req.body.recipientPublicKey;
  if (!recipientLookup) {
    return sendError(res, 'recipientUserId is required', 400);
  }

  const bodyText = content || encryptedContent;
  if (!bodyText) {
    return sendError(res, 'content is required', 400);
  }
  if (bodyText.length > MESSAGE_MAX_LENGTH) {
    return sendError(res, `content exceeds ${MESSAGE_MAX_LENGTH} characters`, 400);
  }

  const db = getDb();
  const recipient =
    (await db.query.users.findFirst({ where: eq(users.id, String(recipientLookup)) })) ||
    (await db.query.users.findFirst({
      where: eq(users.username, String(recipientLookup).toLowerCase()),
    }));

  if (!recipient) {
    return sendError(res, 'Recipient not found', 404);
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

  if (!request || isHiddenBy(request.hiddenBy, authenticatedUserId)) {
    return sendError(res, 'No accepted connection between these users', 403);
  }

  const roomId = getRoomId(authenticatedUserId, recipient.id);

  const [newMessage] = await db
    .insert(messages)
    .values({
      senderId: authenticatedUserId,
      roomId,
      content: encryptedContent ? null : (content ?? null),
      encryptedContent: encryptedContent ?? null,
      encryptedContentForSender: encryptedContentForSender ?? null,
      senderKeyFingerprint: senderKeyFingerprint ?? null,
    })
    .returning();

  return sendSuccess(res, {
    roomId,
    messageId: newMessage.id,
    message: 'Message persisted to database.',
  }, 202);
});

export const removeRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { requestId } = req.params;
  const authenticatedUserId = getAuthenticatedUserId(req);
  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  const db = getDb();
  const chatReq = await db.query.chatRequests.findFirst({
    where: eq(chatRequests.id, requestId),
  });
  if (!chatReq) return sendError(res, 'Request not found', 404);

  if (
    chatReq.fromUserId !== authenticatedUserId &&
    chatReq.toUserId !== authenticatedUserId
  ) {
    return sendError(res, 'Forbidden: you are not part of this request', 403);
  }

  invalidateRequestCache(authenticatedUserId, chatReq.fromUserId, chatReq.toUserId);
  await db.delete(chatRequests).where(eq(chatRequests.id, requestId));
  return sendSuccess(res, { message: 'Connection removed successfully' });
});

export const getUnreadMessageCounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const authenticatedUserId = getAuthenticatedUserId(req);
  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
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

  if (accepted.length === 0) {
    return sendSuccess(res, {});
  }

  const roomConditions = accepted.map((r) => {
    const otherId =
      r.fromUserId === authenticatedUserId ? r.toUserId : r.fromUserId;
    const roomId = getRoomId(authenticatedUserId, otherId);
    return { otherId, roomId };
  });

  const roomIds = roomConditions.map((rc) => rc.roomId);
  const rows = await db
    .select({
      roomId: messages.roomId,
      value: count(),
    })
    .from(messages)
    .leftJoin(chatClears, and(eq(chatClears.roomId, messages.roomId), eq(chatClears.userId, authenticatedUserId)))
    .where(
      and(
        inArray(messages.roomId, roomIds),
        ne(messages.senderId, authenticatedUserId),
        eq(messages.read, false),
        or(isNull(chatClears.clearedAt), gt(messages.timestamp, chatClears.clearedAt))
      )
    )
    .groupBy(messages.roomId);

  const roomCountMap = new Map(rows.map((r) => [r.roomId, Number(r.value)]));
  const unreadCounts: Record<string, number> = {};
  for (const rc of roomConditions) {
    const count = roomCountMap.get(rc.roomId) ?? 0;
    if (count > 0) unreadCounts[rc.otherId] = count;
  }

  return sendSuccess(res, unreadCounts);
});

export const updateContactName = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contactUserId, customName } = req.body as {
    contactUserId?: string;
    customName?: string;
  };
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }
  if (!contactUserId) {
    return sendError(res, 'Contact user ID is required', 400);
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
    return sendError(res, 'Connection not found', 404);
  }

  const patch =
    chatReq.fromUserId === authenticatedUserId
      ? { fromCustomName: customName }
      : { toCustomName: customName };

  await db
    .update(chatRequests)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(chatRequests.id, chatReq.id));

  return sendSuccess(res, { message: 'Contact name updated successfully', customName });
});

export const disconnectChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contactUserId } = req.body as { contactUserId?: string };
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }
  if (!contactUserId) {
    return sendError(res, 'Contact user ID is required', 400);
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
    return sendError(res, 'Connection not found', 404);
  }

  const hiddenBy = new Set(chatReq.hiddenBy ?? []);
  hiddenBy.add(authenticatedUserId);

  invalidateRequestCache(authenticatedUserId, contactUserId);

  await db
    .update(chatRequests)
    .set({ hiddenBy: Array.from(hiddenBy), updatedAt: new Date() })
    .where(eq(chatRequests.id, chatReq.id));

  return sendSuccess(res, { message: 'Disconnected successfully' });
});

export const getConnectionStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params;
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  if (!roomId || !isParticipantRoomId(roomId, authenticatedUserId)) {
    return sendError(res, 'Invalid Room ID', 400);
  }

  const otherId = roomId.split('_').find((p) => p !== authenticatedUserId);
  if (!otherId) {
    return sendError(res, 'Invalid Room ID', 400);
  }

  const db = getDb();
  const row = await db.query.chatRequests.findFirst({
    where: or(
      and(
        eq(chatRequests.fromUserId, authenticatedUserId),
        eq(chatRequests.toUserId, otherId)
      ),
      and(
        eq(chatRequests.fromUserId, otherId),
        eq(chatRequests.toUserId, authenticatedUserId)
      )
    ),
  });

  return sendSuccess(res, {
    connection: row ? { status: row.status, hiddenBy: row.hiddenBy ?? [] } : null,
  });
});

export const reconnectChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contactUserId } = req.body as { contactUserId?: string };
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }
  if (!contactUserId) {
    return sendError(res, 'Contact user ID is required', 400);
  }

  const db = getDb();
  const row = await db.query.chatRequests.findFirst({
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

  if (!row) {
    return sendError(res, 'Connection not found', 404);
  }

  if (row.status === 'pending') {
    return sendError(res, 'Request already pending', 400);
  }

  if (row.status === 'accepted' && (row.hiddenBy ?? []).length === 0) {
    return sendError(res, 'Connection is already active', 400);
  }

  invalidateRequestCache(authenticatedUserId, contactUserId);

  const [updated] = await db
    .update(chatRequests)
    .set({
      status: 'pending',
      fromUserId: authenticatedUserId,
      toUserId: contactUserId,
      hiddenBy: [],
      updatedAt: new Date(),
    })
    .where(eq(chatRequests.id, row.id))
    .returning();

  return sendSuccess(res, { message: 'Reconnect request sent', request: updated });
});

export const createInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const authenticatedUserId = getAuthenticatedUserId(req);
  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized', 401);
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

  return sendSuccess(res, { invite }, 201);
});

export const acceptInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const authenticatedUserId = getAuthenticatedUserId(req);
  const { token } = req.body as { token?: string };

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized', 401);
  }
  if (!token) {
    return sendError(res, 'token required', 400);
  }

  const db = getDb();
  const invite = await db.query.invites.findFirst({
    where: eq(invites.token, token),
  });

  if (!invite) {
    return sendError(res, 'Invite not found', 404);
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return sendError(res, 'Invite expired', 410);
  }
  if (invite.createdById === authenticatedUserId) {
    return sendError(res, 'Cannot accept your own invite', 400);
  }

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
  return sendSuccess(res, { request, roomId, otherUserId: invite.createdById });
});

let onlineSocketsByUserIdRef: Map<string, Set<string>>;

export const setOnlineSocketsRef = (ref: Map<string, Set<string>>) => {
  onlineSocketsByUserIdRef = ref;
};

export const searchMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const authenticatedUserId = getAuthenticatedUserId(req);
  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized', 401);
  }

  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    return sendError(res, 'Query must be at least 2 characters', 400);
  }
  if (q.length > 100) {
    return sendError(res, 'Query too long (max 100 characters)', 400);
  }

  const db = getDb();

  const accepted = await db
    .select({ fromUserId: chatRequests.fromUserId, toUserId: chatRequests.toUserId })
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

  if (accepted.length === 0) {
    return sendSuccess(res, { results: [] });
  }

  const roomIds = accepted.map((r) => getRoomId(r.fromUserId, r.toUserId));

  const pattern = `%${q}%`;
  const rows = await db
    .select({
      id: messages.id,
      roomId: messages.roomId,
      content: messages.content,
      encryptedContent: messages.encryptedContent,
      senderId: messages.senderId,
      timestamp: messages.timestamp,
    })
    .from(messages)
    .leftJoin(chatClears, and(eq(chatClears.roomId, messages.roomId), eq(chatClears.userId, authenticatedUserId)))
    .where(
      and(
        inArray(messages.roomId, roomIds),
        sql`${messages.content} ILIKE ${pattern}`,
        or(isNull(chatClears.clearedAt), gt(messages.timestamp, chatClears.clearedAt))
      )
    )
    .orderBy(desc(messages.timestamp))
    .limit(20);

  const senderIds = [...new Set(rows.map((r) => r.senderId))];
  const userRows = senderIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, senderIds))
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, publicUser(u)]));

  const results = rows.map((msg) => ({
    messageId: msg.id,
    roomId: msg.roomId,
    snippet: (msg.content ?? '').substring(0, 200),
    isEncrypted: !!msg.encryptedContent && !msg.content,
    sender: userMap.get(msg.senderId) ?? null,
    createdAt: msg.timestamp,
  }));

  return sendSuccess(res, { results, total: results.length });
});

export const getOnlineStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(res, 'Unauthorized: No active session', 401);
  }

  const isOnline = (onlineSocketsByUserIdRef?.get(userId)?.size ?? 0) > 0;
  return sendSuccess(res, { userId, online: !!isOnline });
});
