import type { Server, Socket } from 'socket.io';
import { toggleReaction, ReactionError } from '../lib/reactions';
import { logger } from '../lib/logger';
import type { SocketDeps } from './types';

const REACTION_THROTTLE_MS = 250;
const lastReactionAt = new Map<string, number>();

export function registerReactionHandlers(io: Server, socket: Socket, _deps: SocketDeps) {
  const currentUser = socket.data.user as { id: string } | undefined;
  if (!currentUser?.id) return;
  const currentUserId = currentUser.id;

  socket.on('disconnect', () => {
    lastReactionAt.delete(socket.id);
  });

  socket.on(
    'react_message',
    async (
      data: { messageId?: string; emoji?: string },
      ack?: (payload: {
        ok: boolean;
        error?: string;
        messageId?: string;
        emoji?: string | null;
        userId?: string | null;
        action?: 'added' | 'changed' | 'removed';
        roomId?: string;
      }) => void
    ) => {
      try {
        if (!data.messageId || typeof data.emoji !== 'string') {
          ack?.({ ok: false, error: 'messageId and emoji are required' });
          return;
        }
        const now = Date.now();
        const last = lastReactionAt.get(socket.id) || 0;
        if (now - last < REACTION_THROTTLE_MS) {
          ack?.({ ok: false, error: 'Too many reactions' });
          return;
        }
        lastReactionAt.set(socket.id, now);

        const result = await toggleReaction({
          userId: currentUserId,
          messageId: data.messageId,
          emoji: data.emoji,
        });

        const payload = {
          messageId: result.messageId,
          emoji: result.emoji,
          userId: result.userId,
          action: result.action,
          roomId: result.roomId,
        };
        io.to(result.roomId)
          .to(`user:${result.senderId}`)
          .to(`user:${currentUserId}`)
          .emit('message_reaction', payload);

        ack?.({ ok: true, ...payload });
      } catch (err) {
        if (err instanceof ReactionError) {
          ack?.({ ok: false, error: err.message });
          return;
        }
        logger.error({ err }, 'Socket reaction error');
        ack?.({ ok: false, error: 'Reaction failed' });
      }
    }
  );
}

export type { SocketDeps };
