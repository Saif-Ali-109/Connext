export { registerPresenceHandlers } from './presence';
export { registerRoomHandlers } from './rooms';
export { registerMessagingHandlers } from './messaging';
export { registerTypingHandlers } from './typing';
export { registerReactionHandlers } from './reactions';
export type { SocketDeps } from './types';

import type { Server } from 'socket.io';
import { eq, or, and } from 'drizzle-orm';
import { chatRequests, isHiddenBy } from '@connext/db';
import { getDb } from '../lib/constants';
import type { SocketDeps } from './types';

export function createSocketDeps(
  onlineSocketsByUserId: Map<string, Set<string>>,
  messageTimestamps: Map<string, number>
): SocketDeps {
  return {
    onlineSocketsByUserId,
    messageTimestamps,
    emitToContacts: async (io: Server, userId: string, event: string, payload: object) => {
      try {
        const db = getDb();
        const accepted = await db
          .select({ fromUserId: chatRequests.fromUserId, toUserId: chatRequests.toUserId, hiddenBy: chatRequests.hiddenBy })
          .from(chatRequests)
          .where(
            and(
              or(eq(chatRequests.fromUserId, userId), eq(chatRequests.toUserId, userId)),
              eq(chatRequests.status, 'accepted')
            )
          );
        for (const r of accepted) {
          if (isHiddenBy(r.hiddenBy, userId)) continue;
          const contactId = r.fromUserId === userId ? r.toUserId : r.fromUserId;
          io.to(`user:${contactId}`).emit(event, payload);
        }
      } catch {
        // silently degrade
      }
    },
  };
}
