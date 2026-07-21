export * from './schema';
export { createDb, type Db } from './client';
export { hashPassword, verifyPassword } from './password';

/** Sorted user-id room key. Uses `_` so UUID hyphens stay unambiguous. */
export function getRoomId(userIdA: string, userIdB: string): string {
  return [userIdA.trim(), userIdB.trim()].sort().join('_');
}

export function isParticipantRoomId(roomId: string, userId: string): boolean {
  const parts = roomId.split('_');
  return parts.includes(userId.trim());
}

export function otherUserIdFromRoom(roomId: string, userId: string): string | null {
  const parts = roomId.split('_');
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (a === userId) return b;
  if (b === userId) return a;
  return null;
}
