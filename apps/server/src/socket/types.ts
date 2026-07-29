import type { Server, Socket } from 'socket.io';

export interface SocketDeps {
  onlineSocketsByUserId: Map<string, Set<string>>;
  messageTimestamps: Map<string, number>;
  emitToContacts: (io: Server, userId: string, event: string, payload: object) => Promise<void>;
}

export type HandlerRegistrar = (io: Server, socket: Socket, deps: SocketDeps) => void;
