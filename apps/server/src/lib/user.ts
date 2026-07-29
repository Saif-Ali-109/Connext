import { users } from '@connext/db';

export function publicUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    displayName: row.displayName || row.name,
    avatarUrl: row.avatarUrl || row.image,
    publicKey: row.publicKey ?? null,
    lastSeenAt: row.lastSeenAt,
    hasPassword: Boolean(row.passwordHash),
    emailVerified: row.emailVerified ?? null,
  };
}
