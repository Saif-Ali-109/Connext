import type { Server, Socket } from 'socket.io';
import { eq } from 'drizzle-orm';
import { users, getRoomId, isParticipantRoomId } from '@connext/db';
import { getDb } from '../lib/constants';
import { logger } from '../lib/logger';
import type { SocketDeps } from './types';

export function registerRoomHandlers(_io: Server, socket: Socket, _deps: SocketDeps) {
  const currentUser = socket.data.user as { id: string } | undefined;
  if (!currentUser?.id) return;
  const currentUserId = currentUser.id;

  socket.on(
    'join_room',
    async (payload: string | { roomId?: string; otherIdentifier?: string }) => {
      const requestedRoomId =
        typeof payload === 'object' && payload !== null ? payload.roomId : undefined;
      const otherIdentifier =
        typeof payload === 'object' && payload !== null
          ? payload.otherIdentifier
          : payload;

      if (requestedRoomId && isParticipantRoomId(requestedRoomId, currentUserId)) {
        socket.join(requestedRoomId);
        socket.emit('room_joined', { roomId: requestedRoomId });
        return;
      }

      if (!otherIdentifier) return;

      try {
        const db = getDb();
        const normalized = otherIdentifier.trim();
        let otherUser =
          (await db.query.users.findFirst({ where: eq(users.id, normalized) })) ||
          (await db.query.users.findFirst({
            where: eq(users.username, normalized.toLowerCase()),
          }));

        if (!otherUser) return;

        const roomId = getRoomId(currentUserId, otherUser.id);
        socket.join(roomId);
        socket.emit('room_joined', { roomId });
      } catch (err) {
        logger.error({ err }, 'Socket join error');
      }
    }
  );
}
