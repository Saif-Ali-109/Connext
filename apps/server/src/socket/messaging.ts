import type { Server, Socket } from 'socket.io';
import { eq, and, or, isNull } from 'drizzle-orm';
import { users, messages, chatRequests, getRoomId, isHiddenBy, MESSAGE_MAX_LENGTH } from '@connext/db';
import { getDb } from '../lib/constants';
import { logger } from '../lib/logger';
import type { SocketDeps } from './types';

export function registerMessagingHandlers(io: Server, socket: Socket, deps: SocketDeps) {
  const currentUser = socket.data.user as { id: string } | undefined;
  if (!currentUser?.id) return;
  const currentUserId = currentUser.id;

  socket.on(
    'send_message',
    async (
      data: {
        messageId?: string;
        recipientUserId?: string;
        recipientPublicKey?: string;
        content?: string;
        encryptedContent?: string;
        encryptedContentForSender?: string;
        senderKeyFingerprint?: string;
      },
      ack?: (payload: {
        ok: boolean;
        error?: string;
        messageId?: string;
        delivered?: boolean;
      }) => void
    ) => {
      try {
        const now = Date.now();
        const last = deps.messageTimestamps.get(socket.id) || 0;
        if (now - last < 500) {
          ack?.({ ok: false, error: 'Too many messages' });
          return;
        }
        deps.messageTimestamps.set(socket.id, now);

        const recipientLookup = data.recipientUserId || data.recipientPublicKey;
        const bodyText = data.content || data.encryptedContent;
        if (!recipientLookup || !bodyText) {
          ack?.({ ok: false, error: 'Missing recipient or content' });
          return;
        }
        if (bodyText.length > MESSAGE_MAX_LENGTH) {
          ack?.({ ok: false, error: `content exceeds ${MESSAGE_MAX_LENGTH} characters` });
          return;
        }

        const db = getDb();
        const recipient =
          (await db.query.users.findFirst({
            where: eq(users.id, recipientLookup.trim()),
          })) ||
          (await db.query.users.findFirst({
            where: eq(users.username, recipientLookup.trim().toLowerCase()),
          }));

        if (!recipient) {
          ack?.({ ok: false, error: 'Recipient not found' });
          return;
        }

        const request = await db.query.chatRequests.findFirst({
          where: and(
            or(
              and(
                eq(chatRequests.fromUserId, currentUserId),
                eq(chatRequests.toUserId, recipient.id)
              ),
              and(
                eq(chatRequests.fromUserId, recipient.id),
                eq(chatRequests.toUserId, currentUserId)
              )
            ),
            eq(chatRequests.status, 'accepted')
          ),
        });

        if (!request || isHiddenBy(request.hiddenBy, currentUserId)) {
          ack?.({ ok: false, error: 'No accepted connection between these users' });
          return;
        }

        const roomId = getRoomId(currentUserId, recipient.id);

        const messageId = data.messageId?.startsWith('relay-') ? undefined : data.messageId;

        const relayPayload: {
          id: string;
          sender: { id: string };
          roomId: string;
          content: string | null;
          encryptedContent: string | null;
          encryptedContentForSender: string | null;
          senderKeyFingerprint: string | null;
          createdAt: string;
        } = {
          id: messageId || `relay-${Date.now()}`,
          sender: { id: currentUserId },
          roomId,
          content: data.content ?? null,
          encryptedContent: data.encryptedContent ?? null,
          encryptedContentForSender: data.encryptedContentForSender ?? null,
          senderKeyFingerprint: data.senderKeyFingerprint ?? null,
          createdAt: new Date().toISOString(),
        };

        try {
          const [dbMsg] = await db
            .insert(messages)
            .values({
              id: messageId,
              senderId: currentUserId,
              roomId,
              content: data.content ?? null,
              encryptedContent: data.encryptedContent ?? null,
              encryptedContentForSender: data.encryptedContentForSender ?? null,
              senderKeyFingerprint: data.senderKeyFingerprint ?? null,
            })
            .returning();
          relayPayload.id = dbMsg.id;
        } catch (err) {
          logger.error({ err }, 'Failed to persist message');
        }

        const recipientId = recipient.id;
        const recipientSockets = deps.onlineSocketsByUserId.get(recipientId);
        const isRecipientOnline = !!recipientSockets && recipientSockets.size > 0;
        const targetRooms = [
          roomId,
          `user:${recipientId}`,
          `user:${currentUserId}`,
        ];

        let emitter = io.to(targetRooms[0]);
        targetRooms.slice(1).forEach((target) => {
          emitter = emitter.to(target);
        });
        emitter.emit('receive_message', relayPayload);

        if (isRecipientOnline && !relayPayload.id.startsWith('relay-')) {
          try {
            await db
              .update(messages)
              .set({ deliveredAt: new Date() })
              .where(eq(messages.id, relayPayload.id));
          } catch (err) {
            logger.error({ err }, 'Failed to persist deliveredAt');
          }
        }

        socket.emit('message_delivery_status', {
          recipientUserId: recipientId,
          messageId: relayPayload.id,
          delivered: isRecipientOnline,
        });

        ack?.({
          ok: true,
          messageId: relayPayload.id,
          delivered: isRecipientOnline,
        });
      } catch (error) {
        logger.error({ err: error }, 'Socket send error');
        ack?.({
          ok: false,
          error: error instanceof Error ? error.message : 'Socket send failed',
        });
      }
    }
  );

  socket.on('message_delivered', async (data: { roomId: string; messageId: string }) => {
    const { roomId, messageId } = data;
    if (!roomId || !messageId) return;
    socket.to(roomId).emit('message_delivered_relay', { messageId });
    try {
      const db = getDb();
      const [msg] = await db
        .update(messages)
        .set({ deliveredAt: new Date() })
        .where(and(eq(messages.id, messageId), isNull(messages.deliveredAt)))
        .returning();
      const senderId = msg?.senderId;
      if (senderId) {
        io.to(`user:${senderId}`)
          .to(`user:${currentUserId}`)
          .emit('message_delivered_relay', { messageId });
      }
    } catch (e) {
      logger.error({ err: e }, 'Failed to sync message_delivered');
    }
  });

  socket.on('message_read', async (data: { roomId: string; messageId: string }) => {
    const { roomId, messageId } = data;
    if (!roomId || !messageId) return;
    socket.to(roomId).emit('message_read_relay', { messageId });
    try {
      const db = getDb();
      const [msg] = await db
        .update(messages)
        .set({ read: true })
        .where(eq(messages.id, messageId))
        .returning();
      if (msg) {
        io.to(`user:${msg.senderId}`)
          .to(`user:${currentUserId}`)
          .emit('message_read_relay', { messageId });
      }
    } catch (e) {
      logger.error({ err: e }, 'Failed to sync message_read');
    }
  });
}
