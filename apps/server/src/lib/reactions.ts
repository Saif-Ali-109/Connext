import { and, eq, isNull } from 'drizzle-orm';
import { messages, isParticipantRoomId } from '@connext/db';
import { getDb } from './constants';

export const EMOJI_MAX_LENGTH = 16;

export class ReactionError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export type ReactionAction = 'added' | 'changed' | 'removed';

export type ReactionToggleResult = {
  messageId: string;
  emoji: string | null;
  userId: string | null;
  action: ReactionAction;
  roomId: string;
  senderId: string;
};

type ReactionColumn = typeof messages.reaction | typeof messages.reactedByUserId;

const sameAs = (column: ReactionColumn, value: string | null) =>
  value === null ? isNull(column) : eq(column, value);

/**
 * Toggle a single-slot reaction on a message. Only the RECIPIENT of the
 * message may react: the reactor must be a participant of the message's room
 * (1-to-1 rooms have exactly two participants, so this plus `senderId !==
 * userId` pins the reactor to the recipient) and reacting to your own message
 * is rejected with 403. Tapping the same emoji you already put clears it; any
 * other emoji replaces.
 *
 * The write re-asserts the values observed at read time so two racing toggles
 * can't silently clobber each other; on a conflict we re-read and retry.
 */
export async function toggleReaction(opts: {
  userId: string;
  messageId: string;
  emoji: string;
}): Promise<ReactionToggleResult> {
  const { userId, messageId, emoji } = opts;

  if (typeof emoji !== 'string') {
    throw new ReactionError('Invalid emoji', 400);
  }
  const trimmed = emoji.trim();
  if (!trimmed || trimmed.length > EMOJI_MAX_LENGTH) {
    throw new ReactionError('Invalid emoji', 400);
  }

  const db = getDb();

  for (let attempt = 0; attempt < 3; attempt++) {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      throw new ReactionError('Message not found', 404);
    }
    if (message.senderId === userId || !isParticipantRoomId(message.roomId, userId)) {
      throw new ReactionError('Forbidden: only the recipient can react', 403);
    }

    const mine = message.reactedByUserId === userId;
    const same = message.reaction === trimmed;

    const action: ReactionAction = mine && same ? 'removed' : mine ? 'changed' : 'added';
    const nextReaction = mine && same ? null : trimmed;
    const nextReactedByUserId = mine && same ? null : userId;

    const [updated] = await db
      .update(messages)
      .set({ reaction: nextReaction, reactedByUserId: nextReactedByUserId })
      .where(
        and(
          eq(messages.id, messageId),
          sameAs(messages.reaction, message.reaction),
          sameAs(messages.reactedByUserId, message.reactedByUserId)
        )
      )
      .returning();

    if (updated) {
      return {
        messageId: updated.id,
        emoji: nextReaction,
        userId: nextReactedByUserId,
        action,
        roomId: updated.roomId,
        senderId: updated.senderId,
      };
    }
  }

  throw new ReactionError('Reaction conflict, please retry', 409);
}
