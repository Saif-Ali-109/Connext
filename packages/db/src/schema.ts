import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
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
  ]
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

export const messages = pgTable('message', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  senderId: text('senderId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roomId: text('roomId').notNull(),
  content: text('content'),
  read: boolean('read').default(false).notNull(),
  deliveredAt: timestamp('deliveredAt', { mode: 'date' }),
  timestamp: timestamp('timestamp', { mode: 'date' }).defaultNow().notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow().notNull(),
});

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
  (t) => [uniqueIndex('chat_request_pair_idx').on(t.fromUserId, t.toUserId)]
);

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
