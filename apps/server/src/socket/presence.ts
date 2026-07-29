import type { Server, Socket } from 'socket.io';
import type { SocketDeps } from './types';

export function registerPresenceHandlers(io: Server, socket: Socket, deps: SocketDeps) {
  const { onlineSocketsByUserId, emitToContacts, messageTimestamps } = deps;
  const currentUser = socket.data.user as { id: string } | undefined;
  if (!currentUser?.id) {
    socket.disconnect();
    return;
  }
  const currentUserId = currentUser.id;

  const userSockets = onlineSocketsByUserId.get(currentUserId) ?? new Set<string>();
  userSockets.add(socket.id);
  onlineSocketsByUserId.set(currentUserId, userSockets);
  socket.join(`user:${currentUserId}`);
  void emitToContacts(io, currentUserId, 'user_online', { userId: currentUserId });

  socket.on('disconnect', () => {
    const ownedSockets = onlineSocketsByUserId.get(currentUserId);
    if (ownedSockets) {
      ownedSockets.delete(socket.id);
      if (ownedSockets.size === 0) {
        onlineSocketsByUserId.delete(currentUserId);
        void emitToContacts(io, currentUserId, 'user_offline', { userId: currentUserId });
      }
    }
    messageTimestamps.delete(socket.id);
  });
}
