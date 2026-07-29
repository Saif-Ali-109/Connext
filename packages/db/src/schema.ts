import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const MESSAGE_MAX_LENGTH = 5000;
import { randomUUID } from 'crypto';

/** Auth.js + app user profile (extended) */
export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  username: text('username').unique(),
  passwordHash: text('passwordHash'),
  displayName: text('displayName'),
  avatarUrl: text('avatarUrl'),
  publicKey: text('publicKey'),
  fcmToken: text('fcmToken'),
  lastSeenAt: timestamp('lastSeenAt', { mode: 'date' }).defaultNow(),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow().notNull(),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
    index('accounts_user_id_idx').on(account.userId),
  ]
);

export const sessions = pgTable(
  'session',
  {
    sessionToken: text('sessionToken').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)]
);

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

export const messages = pgTable(
  'message',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    senderId: text('senderId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roomId: text('roomId').notNull(),
    content: text('content'),
    encryptedContent: text('encryptedContent'),
    encryptedContentForSender: text('encryptedContentForSender'),
    read: boolean('read').default(false).notNull(),
    deliveredAt: timestamp('deliveredAt', { mode: 'date' }),
    timestamp: timestamp('timestamp', { mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('messages_room_id_idx').on(t.roomId),
    index('messages_room_id_timestamp_idx').on(t.roomId, t.timestamp),
    index('messages_sender_id_idx').on(t.senderId),
    index('messages_read_room_id_idx').on(t.roomId, t.read),
    index('messages_content_trgm_idx').using(
      'gin',
      sql`${t.content} gin_trgm_ops`
    ),
  ]
);

/** Enable pg_trgm extension for trigram-based full-text search. */
export const enablePgTrgm = sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

export const chatRequests = pgTable(
  'chat_request',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    fromUserId: text('fromUserId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: text('toUserId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    fromCustomName: text('fromCustomName'),
    toCustomName: text('toCustomName'),
    hiddenBy: text('hiddenBy').array().default([]).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('chat_request_pair_idx').on(t.fromUserId, t.toUserId),
    index('chat_requests_status_idx').on(t.status),
  ]
);

/**
 * Sliding-window rate limit for emailed sign-in codes. One row per email; we
 * count requests inside the current window and block once the cap is hit until
 * the window rolls over. Postgres-backed so it survives restarts and holds
 * across multiple web instances.
 */
export const verificationCodes = pgTable(
  'verification_code',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    code: text('code').notNull(),
    type: text('type').notNull().$type<'email_verification' | 'email_change'>(),
    expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
    usedAt: timestamp('usedAt', { mode: 'date' }),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('verification_codes_user_id_idx').on(t.userId),
  ]
);

export const emailCodeRateLimits = pgTable('email_code_rate_limit', {
  identifier: text('identifier').primaryKey(),
  count: integer('count').default(0).notNull(),
  windowStart: timestamp('windowStart', { mode: 'date' }).defaultNow().notNull(),
});

export const invites = pgTable('invite', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  token: text('token').notNull().unique(),
  createdById: text('createdById')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  acceptedById: text('acceptedById').references(() => users.id, {
    onDelete: 'set null',
  }),
  expiresAt: timestamp('expiresAt', { mode: 'date' }),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  messages: many(messages),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

export const chatRequestsRelations = relations(chatRequests, ({ one }) => ({
  fromUser: one(users, {
    fields: [chatRequests.fromUserId],
    references: [users.id],
    relationName: 'fromUser',
  }),
  toUser: one(users, {
    fields: [chatRequests.toUserId],
    references: [users.id],
    relationName: 'toUser',
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type ChatRequest = typeof chatRequests.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type VerificationCode = typeof verificationCodes.$inferSelect;
export type EmailCodeRateLimit = typeof emailCodeRateLimits.$inferSelect;
