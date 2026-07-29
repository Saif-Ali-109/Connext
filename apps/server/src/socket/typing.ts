import type { Server, Socket } from 'socket.io';
import type { SocketDeps } from './types';

export function registerTypingHandlers(_io: Server, socket: Socket, _deps: SocketDeps) {
  const currentUser = socket.data.user as { id: string } | undefined;
  if (!currentUser?.id) return;
  const currentUserId = currentUser.id;

  socket.on('typing_start', ({ roomId }: { roomId: string }) => {
    socket.to(roomId).emit('user_typing', { userId: currentUserId, roomId });
  });

  socket.on('typing_stop', ({ roomId }: { roomId: string }) => {
    socket.to(roomId).emit('user_stopped_typing', { userId: currentUserId, roomId });
  });
}
