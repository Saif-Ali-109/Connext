# Connext — Technical Documentation

Connext is a real-time, one-to-one chat application with flexible authentication (username/password, email/password, Google OAuth), user discovery, connection requests, and live messaging with delivery/read receipts.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Directory Structure](#directory-structure)
- [Authentication System](#authentication-system)
- [Database Schema](#database-schema)
- [REST API Reference](#rest-api-reference)
- [Real-Time Messaging](#real-time-messaging)
- [Media Uploads](#media-uploads)
- [Push Notifications](#push-notifications)
- [Security](#security)
- [Environment Variables](#environment-variables)
- [Shared Packages](#shared-packages)
- [Development & Deployment](#development--deployment)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ NextAuth  │  │  React UI   │  │  Socket.IO Client    │  │
│  │  Session  │  │  (Next.js)  │  │  (chat, typing,      │  │
│  │           │  │             │  │   delivery, receipts)  │  │
│  └─────┬─────┘  └──────┬──────┘  └──────────┬───────────┘  │
│        │                │                    │              │
└────────┼────────────────┼────────────────────┼──────────────┘
         │                │                    │
         ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js 15 (apps/web)                      │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │  API Routes      │  │  /api/auth/[...nextauth]        │  │
│  │                  │  │  /api/auth/bridge               │  │
│  │                  │  │  /api/auth/signup               │  │
│  └──────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │  Bridge (HMAC-signed payload)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Express 4 (apps/server)                     │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │  REST API  │  │ Socket.IO  │  │  Middleware          │  │
│  │  /auth/*   │  │  Server    │  │  JWT Auth            │  │
│  │  /chat/*   │  │            │  │  Helmet, CORS        │  │
│  │  /media/*  │  │            │  │  Rate Limiting       │  │
│  └──────┬─────┘  └──────┬─────┘  └──────────────────────┘  │
└─────────┼────────────────┼──────────────────────────────────┘
          │                │
          └────────────────┼──────────────────┐
                           ▼                   ▼
               ┌──────────────────┐  ┌──────────────────┐
               │   PostgreSQL     │  │  Cloudflare R2   │
               │   (Drizzle ORM)  │  │  (media storage) │
               └──────────────────┘  └──────────────────┘
```

The monorepo follows npm workspaces with four packages:

| Workspace | Role | Entry Point |
|-----------|------|-------------|
| `apps/web` | Frontend + NextAuth | `next dev` on port 3000 |
| `apps/server` | Express API + Socket.IO | `ts-node src/index.ts` on port 4001 |
| `packages/db` | Database schema + utilities | consumed as `@connext/db` |
| `packages/types` | Shared TypeScript interfaces | consumed as `@connext/types` |

Authentication flows through a **two-layer session architecture**: NextAuth handles initial login (credentials, Google, email code) and issues a JWT session. A bridge mechanism passes the session to Express, which issues its own httpOnly JWT cookie for REST and Socket.IO access.

---

## Tech Stack

### apps/web
| Dependency | Version | Purpose |
|-----------|---------|---------|
| Next.js | 15.1.4 | React framework with App Router |
| React | 19.2.5 | UI library |
| Tailwind CSS | 4.2.4 | Utility-first styling |
| Framer Motion | 12.38.0 | Animations |
| Lucide React | 1.14.0 | Icon set |
| Socket.IO Client | 4.8.3 | WebSocket client |
| next-auth | 5.0.0-beta.29 | Authentication framework |
| @auth/drizzle-adapter | 1.10.0 | Auth.js → Drizzle adapter |
| drizzle-orm | 0.44.2 | ORM for NextAuth adapter + signup |
| postgres | 3.4.7 | PostgreSQL driver |
| clsx | 2.1.1 | Conditional class names |
| tailwind-merge | 3.5.0 | Tailwind class deduplication |

### apps/server
| Dependency | Version | Purpose |
|-----------|---------|---------|
| Express | 4.22.1 | HTTP framework |
| Socket.IO | 4.8.3 | WebSocket server |
| jsonwebtoken | 9.0.3 | JWT signing and verification |
| helmet | 8.1.0 | Security headers |
| cors | 2.8.6 | Cross-origin requests |
| compression | 1.8.1 | Gzip compression |
| express-rate-limit | 8.4.0 | Rate limiting middleware |
| @aws-sdk/client-s3 | 3.1035.0 | Cloudflare R2 (S3-compatible) |
| @aws-sdk/s3-request-presigner | 3.1035.0 | Presigned upload/download URLs |
| firebase-admin | 12.0.0 | FCM push notifications |
| multer | 2.1.1 | Multipart file upload |
| morgan | 1.10.1 | HTTP request logging |
| cookie-parser | 1.4.7 | Cookie parsing |
| dotenv | 16.6.1 | Environment variable loading |
| uuid | 13.0.0 | UUID generation |

### packages/db
| Dependency | Version | Purpose |
|-----------|---------|---------|
| drizzle-orm | 0.44.2 | Type-safe ORM |
| drizzle-kit | 0.31.4 | Migration tooling |
| postgres | 3.4.7 | PostgreSQL driver |
| crypto | (built-in) | scrypt password hashing |

---

## Directory Structure

```
connext/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   │   ├── favicon.svg
│   │   │   ├── logo.svg
│   │   │   └── logo-rect.svg
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx              # Root layout (ThemeProvider, SessionProvider)
│   │       │   ├── page.tsx                # Splash → redirect to /dashboard or /login
│   │       │   ├── api/
│   │       │   │   └── auth/
│   │       │   │       ├── [...nextauth]/route.ts
│   │       │   │       ├── bridge/route.ts
│   │       │   │       └── signup/route.ts
│   │       │   ├── login/page.tsx          # Login/signup (3 tabs: password, email, anon)
│   │       │   ├── login/verify/page.tsx
│   │       │   ├── dashboard/page.tsx      # Contact list + unread badges
│   │       │   ├── chat/
│   │       │   │   ├── layout.tsx
│   │       │   │   ├── page.tsx
│   │       │   │   ├── ChatClient.tsx      # Live messaging UI
│   │       │   │   └── [roomId]/page.tsx
│   │       │   ├── requests/page.tsx       # Connection requests + search
│   │       │   ├── onboarding/page.tsx     # Post-signup username/password setup
│   │       │   ├── connect/page.tsx        # Alias for /login
│   │       │   ├── invite/page.tsx         # Invite link processing
│   │       │   └── reset-password/page.tsx # Password recovery
│   │       ├── components/
│   │       │   ├── ClientProviders.tsx      # Session + Bridge + Notification providers
│   │       │   ├── Navigation.tsx           # Top nav bar
│   │       │   ├── NotificationManager.tsx  # Browser notification handler
│   │       │   ├── PasswordInput.tsx        # Show/hide password toggle
│   │       │   ├── ThemeProvider.tsx        # Dark/light theme context
│   │       │   ├── chat/MediaMessage.tsx    # Image/video/audio/file renderer
│   │       │   └── ui/
│   │       │       ├── motion.tsx           # Framer Motion primitives
│   │       │       └── InteractiveBackground.tsx # Animated gradient background
│   │       ├── lib/
│   │       │   ├── api.ts                  # Server URL + headers
│   │       │   ├── clipboard.ts            # Copy utility
│   │       │   ├── localChatStore.ts       # localStorage message cache
│   │       │   ├── media.ts               # Upload/download helpers
│   │       │   ├── roomId.ts              # Room ID utilities
│   │       │   ├── storage.ts             # Auth cache wrappers
│   │       │   └── walletLinks.ts         # Legacy wallet deep links
│   │       ├── styles/globals.css         # Tailwind 4 + theme variables
│   │       ├── types/
│   │       │   ├── css.d.ts
│   │       │   └── next-auth.d.ts         # Session type augmentation
│   │       └── auth.ts                    # NextAuth configuration
│   └── server/
│       └── src/
│           ├── index.ts                   # Express + Socket.IO bootstrap
│           ├── routes/
│           │   ├── auth.ts
│           │   ├── chat.ts
│           │   ├── media.ts
│           │   └── notifications.ts
│           ├── controllers/
│           │   ├── auth.controller.ts
│           │   ├── chat.controller.ts
│           │   ├── media.controller.ts
│           │   └── notification.controller.ts
│           ├── middleware/
│           │   ├── auth.middleware.ts      # JWT cookie verification
│           │   └── rateLimiter.ts          # IP-based rate limiter
│           └── lib/
│               ├── bridge.ts              # HMAC signature + verify
│               ├── constants.ts           # Env vars + DB singleton
│               ├── env.ts                 # Env reader with defaults
│               ├── fcm.ts                 # Firebase Admin SDK
│               └── r2.ts                  # Cloudflare R2 client
├── packages/
│   ├── db/
│   │   ├── drizzle.config.ts
│   │   └── src/
│   │       ├── index.ts                   # Public API
│   │       ├── schema.ts                  # All table definitions
│   │       ├── client.ts                  # Drizzle client factory
│   │       └── password.ts               # scrypt hash + verify
│   └── types/
│       └── index.ts                       # Shared interfaces
```

---

## Authentication System

### Providers

Three authentication providers are configured in `apps/web/src/auth.ts`, each conditionally enabled based on environment variables:

| Provider | Env Guard | Flow | Signup Path |
|----------|-----------|------|-------------|
| Credentials | `DATABASE_URL` set | username/email + password | `POST /api/auth/signup` |
| Google | `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` | OAuth 2.0 redirect | Automatic via adapter |
| Nodemailer | `BREVO_API_KEY` | 6-digit email code | Code → onboarding |

### Credentials Provider (`auth.ts:86-113`)

The `authorize` callback:
1. Receives `{ identifier, password }` — identifier can be email or username
2. Looks up user by `email` OR `username` in the `users` table
3. Returns `null` if user not found or `passwordHash` is null
4. Calls `verifyPassword(password, user.passwordHash)` with constant-time comparison
5. Returns `{ id, email, name, image }` on success

### Nodemailer Provider (`auth.ts:126-198`)

Custom `sendVerificationRequest` sends codes via Brevo HTTPS API (not SMTP):
- Generates 6-digit code: `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')`
- Code expires in 10 minutes (`maxAge: 600`)
- Rate limit: max 10 codes per email per 10-minute window (backed by `email_code_rate_limits` table)
- Email validation: rejects sub-addressed (+tag) emails
- 10-second timeout via `AbortController`
- Uses `codeGoal` parameter to distinguish signup (`/onboarding`) vs recovery (`/reset-password`)

### Google OAuth Provider (`auth.ts:115-124`)

- `allowDangerousEmailAccountLinking: true` — allows same email to link multiple OAuth accounts
- `prompt: 'select_account'` — forces Google account picker on every login

### Session Bridge (NextAuth → Express JWT)

The bridge solves the dual-auth architecture. Details in `apps/web/src/components/ClientProviders.tsx:94-146` and `apps/server/src/controllers/auth.controller.ts:40-87`:

```
1. User logs in via NextAuth (any provider)
2. Client fetches GET /api/auth/bridge (Next.js API route)
3. Next.js signs a payload { userId, email, name, image, exp } with HMAC-SHA256 using AUTH_SECRET
4. Returns { payload, sig } — payload valid for 60 seconds
5. Client POSTs { payload, sig } to Express POST /auth/bridge
6. Express verifies HMAC signature, upserts user in DB
7. Express signs JWT { id, email, name } with JWT_SECRET, sets httpOnly cookie "token"
8. Express returns { user: PublicUser }
9. All subsequent API calls use the JWT cookie
```

Bridge payload format (`apps/server/src/lib/bridge.ts`):
```typescript
type BridgePayload = {
  userId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  exp: number;          // Unix timestamp, 60s from issuance
};
```

Signing uses `crypto.createHmac('sha256', AUTH_SECRET)` with `crypto.timingSafeEqual` for verification.

### Express JWT Middleware (`apps/server/src/middleware/auth.middleware.ts`)

```typescript
// Reads "token" cookie, verifies with JWT_SECRET, sets req.user
const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
req.user = decoded;
```

Protected endpoints verify `req.user` exists. JWT is created in `setAuthCookie()` with configurable expiry (default 7 days, `JWT_EXPIRES_DAYS`).

### Password Hashing (`packages/db/src/password.ts`)

Uses Node.js built-in `crypto.scrypt` — no external dependencies.

**Hash** (`hashPassword`):
```
salt = crypto.randomBytes(16)           → 32 hex chars
key  = crypto.scrypt(password, salt, 64) → 128 hex chars
stored = `${salt}:${key}`
```

**Verify** (`verifyPassword`):
```
[salt, hashHex] = stored.split(':')
derived = crypto.scrypt(password, salt, 64)
return timingSafeEqual(Buffer.from(hashHex), derived)
```

- Salt: 128 bits (16 bytes)
- Key length: 512 bits (64 bytes)
- Comparison: constant-time via `crypto.timingSafeEqual`
- Format: `salt:hash` stored in `users.passwordHash` column

Password policy:
- Minimum 8 characters — enforced client-side, Next.js API route, and Express controllers
- No maximum length
- No character complexity rules
- Set during: anonymous signup, onboarding (email/Google users), password reset

---

## Database Schema

All tables defined in `packages/db/src/schema.ts`. Database is PostgreSQL accessed via Drizzle ORM with the `postgres` driver.

### user
Core identity table, shared with Auth.js adapter.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `text` | PK, UUID | Generated via `randomUUID()` |
| `name` | `text` | nullable | Display name (from OAuth or manual) |
| `email` | `text` | unique, nullable | Email for sign-in/recovery |
| `emailVerified` | `timestamp` | nullable | From Auth.js adapter |
| `image` | `text` | nullable | Avatar URL (OAuth) |
| `username` | `text` | unique, nullable | Login handle, `[a-z0-9_]{3,24}` |
| `passwordHash` | `text` | nullable | `salt:hash` scrypt output, null for OAuth-only users |
| `displayName` | `text` | nullable | Custom display name override |
| `avatarUrl` | `text` | nullable | Custom avatar URL override |
| `fcmToken` | `text` | nullable | Firebase Cloud Messaging token |
| `lastSeenAt` | `timestamp` | default `now()` | Updated on bridge session |
| `createdAt` | `timestamp` | not null, default `now()` | |
| `updatedAt` | `timestamp` | not null, default `now()` | |

### account
Auth.js adapter table for OAuth and provider accounts.

| Column | Type | Constraints |
|--------|------|-------------|
| `userId` | `text` | not null, FK → users.id ON DELETE CASCADE |
| `type` | `text` | not null |
| `provider` | `text` | not null |
| `providerAccountId` | `text` | not null |
| `refresh_token` | `text` | nullable |
| `access_token` | `text` | nullable |
| `expires_at` | `integer` | nullable |
| `token_type` | `text` | nullable |
| `scope` | `text` | nullable |
| `id_token` | `text` | nullable |
| `session_state` | `text` | nullable |

Composite PK: `(provider, providerAccountId)`

### session
Auth.js adapter table for database sessions (not used — JWT strategy).

| Column | Type | Constraints |
|--------|------|-------------|
| `sessionToken` | `text` | PK |
| `userId` | `text` | not null, FK → users.id ON DELETE CASCADE |
| `expires` | `timestamp` | not null |

### verificationToken
Auth.js adapter table for email verification codes and tokens.

| Column | Type | Constraints |
|--------|------|-------------|
| `identifier` | `text` | not null (email) |
| `token` | `text` | not null (6-digit code) |
| `expires` | `timestamp` | not null |

Composite PK: `(identifier, token)`

### message
Chat message history.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `text` | PK, UUID | `randomUUID()` |
| `senderId` | `text` | not null, FK → users.id ON DELETE CASCADE | |
| `roomId` | `text` | not null | Format: `minID_maxID` |
| `content` | `text` | nullable | Text content |
| `media` | `jsonb` | nullable | Array of `{ url, type, name, size }` |
| `read` | `boolean` | not null | `false` |
| `deliveredAt` | `timestamp` | nullable | Set on delivery acknowledgment |
| `timestamp` | `timestamp` | not null | `now()` |
| `createdAt` | `timestamp` | not null | `now()` |
| `updatedAt` | `timestamp` | not null | `now()` |

### chat_request
Manages connection requests between users.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `text` | PK, UUID | `randomUUID()` |
| `fromUserId` | `text` | not null, FK → users.id ON DELETE CASCADE | |
| `toUserId` | `text` | not null, FK → users.id ON DELETE CASCADE | |
| `status` | `text` | not null | `'pending'` — one of `pending`, `accepted` |
| `fromCustomName` | `text` | nullable | Custom name set by sender |
| `toCustomName` | `text` | nullable | Custom name set by recipient |
| `hiddenBy` | `text[]` | not null | `[]` — userIds who hid this (disconnect) |
| `createdAt` | `timestamp` | not null | `now()` |
| `updatedAt` | `timestamp` | not null | `now()` |

Unique index: `chat_request_pair_idx` on `(fromUserId, toUserId)`

### invite
Shareable invite links (7-day expiry).

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `text` | PK, UUID | `randomUUID()` |
| `token` | `text` | not null, unique | 32 hex chars |
| `createdById` | `text` | not null, FK → users.id ON DELETE CASCADE | |
| `acceptedById` | `text` | nullable, FK → users.id ON DELETE SET NULL | |
| `expiresAt` | `timestamp` | nullable | 7 days from creation |
| `createdAt` | `timestamp` | not null | `now()` |

### email_code_rate_limit
Sliding-window rate limiter for email verification codes.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `identifier` | `text` | PK | email address |
| `count` | `integer` | not null | `0` |
| `windowStart` | `timestamp` | not null | `now()` |

### Relations (`schema.ts:137-166`)
- `usersRelations`: has many `accounts`, `sessions`, `messages`
- `accountsRelations`: belongs to one `user`
- `sessionsRelations`: belongs to one `user`
- `messagesRelations`: belongs to one `user` (sender)
- `chatRequestsRelations`: belongs to one `fromUser` and one `toUser`

### Exported Types
```typescript
type User            = typeof users.$inferSelect
type NewUser         = typeof users.$inferInsert
type Message         = typeof messages.$inferSelect
type ChatRequest     = typeof chatRequests.$inferSelect
type Invite          = typeof invites.$inferSelect
type EmailCodeRateLimit = typeof emailCodeRateLimits.$inferSelect
```

---

## REST API Reference

All Express endpoints are prefixed (no prefix used — routes are flat). All authenticated routes require the `token` httpOnly cookie set by the bridge flow.

### Auth Routes (`/routes/auth.ts`)

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/auth/bridge` | No | `bridgeSession` | Exchange HMAC bridge payload for JWT cookie |
| GET | `/auth/session` | Yes | `getSession` | Get current user profile |
| POST | `/auth/logout` | Yes | `logout` | Clear JWT cookie |
| POST | `/auth/username` | Yes | `updateUsername` | Set/change username, displayName, or password |
| POST | `/auth/update-password` | Yes | `updatePassword` | Update password (min 8 chars) |
| POST | `/auth/fcm-token` | Yes | `updateFcmToken` | Register FCM push token |
| GET | `/auth/user/:query` | Yes | `getUserByQuery` | Search user by ID, username, or email |
| GET | `/auth/search?q=` | Yes | `getUserByQuery` | Search users by query string |

**POST `/auth/username`** request body:
```json
{ "username": "john_doe", "displayName": "John", "password": "mypassword123" }
```
All fields optional. Password required when claiming a first-time username.

**POST `/auth/update-password`** request body:
```json
{ "password": "newpassword123" }
```

**GET `/auth/user/:query`** response (exact ID match):
```json
{ "id": "...", "email": "...", "name": "...", "username": "...", "displayName": "...", "avatarUrl": "...", "lastSeenAt": "...", "hasPassword": true }
```

**GET `/auth/search?q=john`** response (partial match, limit 10):
```json
{ "users": [...] }
```

### Chat Routes (`/routes/chat.ts`)

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/chat/request` | Yes | `sendRequest` | Send connection request |
| POST | `/chat/respond` | Yes | `respondToRequest` | Accept/reject request |
| GET | `/chat/requests` | Yes | `getRequests` | Get incoming, outgoing, contacts |
| DELETE | `/chat/request/:requestId` | Yes | `removeRequest` | Delete a pending request |
| GET | `/chat/messages/:roomId` | Yes | `getMessages` | Paginated message history |
| POST | `/chat/send-message` | Yes | `sendMessage` | Send message via REST |
| GET | `/chat/unreadCounts` | Yes | `getUnreadMessageCounts` | Unread counts per contact |
| PUT | `/chat/contact-name` | Yes | `updateContactName` | Set custom name for a contact |
| POST | `/chat/disconnect` | Yes | `disconnectChat` | Hide connection (soft delete) |
| GET | `/chat/online-status/:userId` | Yes | `getOnlineStatus` | Check if user is online |
| POST | `/chat/invite` | Yes | `createInvite` | Generate invite link |
| POST | `/chat/invite/accept` | Yes | `acceptInvite` | Accept invite by token |

**POST `/chat/request`** request body:
```json
{ "toUserId": "...", "toUsername": "..." }
```
Either `toUserId` or `toUsername` required. Auto-accepts if mutual pending request exists.

**POST `/chat/respond`** request body:
```json
{ "requestId": "...", "status": "accepted" }
```
Status is `accepted` or `rejected`.

**GET `/chat/requests`** response:
```json
{
  "incoming": [{ "id": "...", "fromUser": {...}, "status": "pending" }],
  "outgoing": [{ "id": "...", "toUser": {...}, "status": "pending" }],
  "contacts": [{ "id": "...", "fromUser": {...}, "toUser": {...}, "status": "accepted" }]
}
```

**GET `/chat/messages/:roomId?page=1&limit=50`** response:
```json
{
  "messages": [{ "id": "...", "senderId": "...", "content": "...", "timestamp": "...", "read": false, "deliveredAt": null, "deliveryState": "sent" }],
  "totalCount": 120,
  "page": 1,
  "limit": 50,
  "hasMore": true
}
```
`deliveryState` is one of `"sent"`, `"delivered"`, `"read"`. Messages the requesting user sent are marked as `"read"` in their own view.

**PUT `/chat/contact-name`** request body:
```json
{ "contactUserId": "...", "customName": "Friend Alias" }
```

**POST `/chat/disconnect`** request body:
```json
{ "contactUserId": "..." }
```
Adds user to `hiddenBy` array — reversible by re-sending a request.

**POST `/chat/invite`** response:
```json
{ "invite": { "id": "...", "token": "abc...789", "expiresAt": "..." } }
```

**POST `/chat/invite/accept`** request body:
```json
{ "token": "abc...789" }
```
Response:
```json
{ "request": {...}, "roomId": "userA_userB", "otherUserId": "..." }
```

### Media Routes (`/routes/media.ts`)

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/media/sign-upload` | Yes | `signUploadUrl` | Get presigned PUT URL for R2 |
| POST | `/media/sign-download` | Yes | `signDownloadUrl` | Get presigned GET URL for R2 |
| POST | `/media/upload` | Yes | `proxyUpload` | Upload file through server via multer |

**POST `/media/sign-upload`** request:
```json
{ "fileName": "photo.jpg", "contentType": "image/jpeg", "size": 1048576 }
```
Response:
```json
{ "uploadUrl": "https://...", "objectKey": "chat-media/uuid/1680000000-photo.jpg", "publicUrl": "..." }
```
Max file size: 25MB (configurable via `MAX_MEDIA_FILE_BYTES`).

**POST `/media/sign-download`** request:
```json
{ "objectKey": "chat-media/uuid/1680000000-photo.jpg" }
```
Response:
```json
{ "downloadUrl": "https://...", "contentType": "image/jpeg" }
```
Requires both users to be in an accepted connection.

**POST `/media/upload`** — multipart form with `file` field. Uploads to R2 and returns:
```json
{ "objectKey": "...", "publicUrl": "...", "contentType": "...", "size": 12345 }
```

### Notification Routes (`/routes/notifications.ts`)

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/notifications/send` | Yes | `sendPushNotification` | Send FCM push to a user |

**POST `/notifications/send`** request:
```json
{ "token": "...", "title": "New message", "body": "Hello!", "data": { "type": "message", "roomId": "..." } }
```
Validates the caller has an accepted connection with the recipient referenced in `data`.

### Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Returns `{ ok: true }` |

---

## Real-Time Messaging

Socket.IO server runs on the same Express instance (`apps/server/src/index.ts`). Authentication is handled via middleware that reads the JWT from `socket.handshake.auth.token` or the `token` cookie.

### Connection

```
socket = io(SERVER_URL, { auth: { token: "jwt..." } })
```

On connect:
- Server verifies JWT, extracts `userId`
- Adds socket to `onlineSocketsByUserId` map
- Broadcasts `user_online: { userId }` to all connected clients

On disconnect:
- Removes socket from tracking
- If user has no more sockets, broadcasts `user_offline: { userId }`

### Client → Server Events

| Event | Payload | Behavior |
|-------|---------|----------|
| `join_room` | `string \| { roomId, otherIdentifier? }` | Join a Socket.IO room by roomId or resolve from otherIdentifier. Emits `room_joined: { roomId }` on success |
| `send_message` | `{ messageId, recipientUserId, content? }` | Validates rate limit (500ms cooldown per socket), checks accepted connection, persists to DB. Emits `receive_message` to recipient's rooms and socket channels. Emits `message_delivery_status` to sender |
| `message_delivered` | `{ roomId, messageId }` | Updates `deliveredAt` in DB. Emits `message_delivered_relay: { messageId }` to sender's sockets |
| `message_read` | `{ roomId, messageId }` | Sets `read = true` in DB. Emits `message_read_relay: { messageId }` to sender's sockets |
| `typing_start` | `{ roomId }` | Broadcasts `user_typing: { userId, roomId }` to room |
| `typing_stop` | `{ roomId }` | Broadcasts `user_stopped_typing: { userId, roomId }` to room |
| `disconnect` | — | Cleanup, emit `user_offline` |

### Server → Client Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `user_online` | `{ userId }` | User connected |
| `user_offline` | `{ userId }` | User disconnected (all sockets gone) |
| `room_joined` | `{ roomId }` | `join_room` succeeded |
| `receive_message` | `{ id, sender, roomId, content, createdAt }` | New message from peer |
| `message_delivery_status` | `{ recipientUserId, messageId, delivered }` | Acknowledgement that recipient received the message |
| `message_delivered_relay` | `{ messageId }` | Peer confirmed delivery |
| `message_read_relay` | `{ messageId }` | Peer read the message |
| `user_typing` | `{ userId, roomId }` | Peer started typing |
| `user_stopped_typing` | `{ userId, roomId }` | Peer stopped typing |

### Room ID Convention

Room IDs are deterministic: sort both user IDs alphabetically and join with underscore.

```typescript
// packages/db/src/index.ts
function getRoomId(a: string, b: string): string {
  return [a, b].sort().join('_');
}
```

Example: `"a1b2c3_d4e5f6"` — consistent regardless of who initiates.

### Rate Limiting

- Message send: 500ms cooldown per socket (in-memory `Map<socketId, timestamp>`)
- REST API: IP-based limiter (100 requests/minute default) via `express-rate-limit` + in-memory fallback

### Internal State

```
onlineSocketsByUserId: Map<string, Set<string>>
  └─ maps userId → set of active socket IDs

messageTimestamps: Map<string, number>
  └─ maps socketId → last message timestamp (rate limiting)
```

---

## Media Uploads

Media files are stored on Cloudflare R2 (S3-compatible object storage). The server uses presigned URLs to avoid exposing R2 credentials to the client.

### Upload Flow (Presigned URL)

```
1. Client → POST /media/sign-upload { fileName, contentType, size }
2. Server validates size (≤ 25MB)
3. Server generates presigned PUT URL (default 300s TTL)
4. Server returns { uploadUrl, objectKey }
5. Client PUTs file directly to the presigned URL
```

### Upload Flow (Proxy)

```
1. Client → POST /media/upload (multipart, field: "file")
2. Server (multer) receives the file in memory
3. Server uploads to R2 via S3 SDK PutObjectCommand
4. Server returns { objectKey, publicUrl, contentType, size }
```

### Download Flow

```
1. Client → POST /media/sign-download { objectKey }
2. Server validates the requesting user has an accepted connection with the file owner
3. Server generates presigned GET URL (default 300s TTL)
4. Server returns { downloadUrl, contentType }
```

### Object Key Convention

```
chat-media/{userId}/{timestamp}-{sanitizedFileName}
```

File names are sanitized: non-alphanumeric characters (except `.` `-` `_`) are stripped.

### R2 Configuration

`apps/server/src/lib/r2.ts` creates an S3 client pointed at Cloudflare R2:
```typescript
new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});
```

---

## Push Notifications

Firebase Cloud Messaging via `firebase-admin` SDK, configured in `apps/server/src/lib/fcm.ts`.

### Configuration

Required env vars: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.

Initialization:
```typescript
admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  }),
});
```

### Send Flow

```
1. Client registers FCM token via POST /auth/fcm-token { fcmToken }
2. When a message is sent via Socket.IO, server checks if recipient has an fcmToken
3. If recipient is offline (no active sockets), server sends FCM data notification
4. Data payload: { type: "message", roomId, senderId, senderName, content }
```

Notification format (Android high-priority):
```typescript
const message = {
  token: recipient.fcmToken,
  data: { type, roomId, senderId, senderName, content },
  android: { priority: 'high' },
};
```

`isFcmConfigured()` returns `false` if any required env var is missing, gracefully skipping push notifications.

### NotificationManager (Client)

`apps/web/src/components/NotificationManager.tsx` handles browser notifications:
1. Requests `Notification` permission on mount
2. Listens for `receive_message` Socket.IO event
3. Fires `new Notification(title, { body, icon })` if:
   - Permission granted
   - App tab is not focused (uses `document.hidden` / `visibilitychange`)
   - Message is from another user
4. Clicking the notification focuses the chat tab

---

## Security

### Password Storage
- Algorithm: `crypto.scrypt` (memory-hard, CPU-hard)
- Salt: 16 random bytes per password (128 bits)
- Key length: 64 bytes (512 bits)
- Comparison: `crypto.timingSafeEqual` (constant-time)
- Format: `salt:hash` stored in `passwordHash` column
- Minimum length: 8 characters

### Session Management
- NextAuth: JWT strategy (encrypted, not opaque DB sessions)
- Express: Custom JWT with `jwt.sign` / `jwt.verify`, httpOnly cookie
- JWT expiry: configurable via `JWT_EXPIRES_DAYS` (default 7 days)
- Bridge payload: 60-second TTL, HMAC-SHA256 signed

### HTTP Headers
- `helmet()` — standard security headers (X-Content-Type-Options, X-Frame-Options, CSP, etc.)
- CORS restricted to `ALLOWED_ORIGINS` (comma-separated, default `http://localhost:3000`)
- `sameSite: 'none'` in production (required for cross-origin cookies)

### Rate Limiting
- Per-socket: 500ms message send cooldown
- Per-IP: 100 requests/minute via `express-rate-limit` + in-memory fallback
- Email codes: 10 per email per 10-minute sliding window (DB-backed)

### Media
- File size limit: 25MB (configurable)
- Presigned URLs with 300s TTL (configurable)
- Download requires accepted connection between both users

### General
- `trustHost: true` in NextAuth (required for production deployments behind proxies)
- Input validation: username format `/^[a-z0-9_]{3,24}$/`, password min 8 chars
- SQL injection: prevented by Drizzle ORM parameterized queries
- HMAC signature verification uses `timingSafeEqual`

---

## Environment Variables

### apps/web

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes (if Credentials) | — | PostgreSQL connection for Auth.js adapter + signup |
| `AUTH_SECRET` | Yes | — | NextAuth encryption + HMAC bridge signing |
| `JWT_SECRET` | No | fallback to AUTH_SECRET | Bridge HMAC fallback |
| `AUTH_GOOGLE_ID` | For Google OAuth | — | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | For Google OAuth | — | Google OAuth client secret |
| `BREVO_API_KEY` | For email codes | — | Brevo (Sendinblue) transactional email API |
| `EMAIL_FROM` | No | `"noreply@connext.local"` | Sender address for verification emails |
| `AUTH_URL` | No | — | Public URL of the Next.js app (NextAuth internal) |
| `NEXT_PUBLIC_SERVER_URL` | No | `http://localhost:4001` | Express server URL for client API calls |

### apps/server

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes (prod) | — | PostgreSQL connection |
| `AUTH_SECRET` | Yes (prod) | — | HMAC bridge signature verification |
| `JWT_SECRET` | Yes (prod) | — | JWT signing and verification |
| `JWT_EXPIRES_DAYS` | No | `7d` | JWT cookie lifetime |
| `PORT` | No | `4001` | Express listen port |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | CORS allowed origins (comma-separated) |
| `R2_ACCOUNT_ID` | For media | — | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | For media | — | R2 access key |
| `R2_SECRET_ACCESS_KEY` | For media | — | R2 secret key |
| `R2_BUCKET` | For media | — | R2 bucket name |
| `R2_REGION` | No | `auto` | R2 region |
| `R2_SIGNED_URL_TTL_SECONDS` | No | `300` | Presigned URL lifetime (seconds) |
| `MAX_MEDIA_FILE_BYTES` | No | `26214400` | Max upload size (bytes, 25MB) |
| `FCM_PROJECT_ID` | For push | — | Firebase project ID |
| `FCM_CLIENT_EMAIL` | For push | — | Firebase service account email |
| `FCM_PRIVATE_KEY` | For push | — | Firebase private key (newlines as `\n`) |

---

## Shared Packages

### @connext/db (`packages/db`)

**Exports** (`src/index.ts`):
- `createDb(connectionString)` → Drizzle client instance
- `hashPassword(password)` → `salt:hash` string
- `verifyPassword(password, stored)` → boolean
- `getRoomId(a, b)` → sorted `a_b` room ID
- `isParticipantRoomId(roomId, userId)` → boolean
- `otherUserIdFromRoom(roomId, userId)` → other participant's ID
- All schema types: `User`, `NewUser`, `Message`, `ChatRequest`, `Invite`, `EmailCodeRateLimit`

**Drizzle Config** (`drizzle.config.ts`):
```typescript
export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
});
```
Run with: `npx drizzle-kit push` or from root: `npm run db:push`

### @connext/types (`packages/types`)

Pure TypeScript interfaces shared between packages:

```typescript
interface User {
  id: string;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  roomId: string;
}

interface ChatRoom {
  id: string;
  participants: string[];
  lastMessage?: Message;
}
```

---

## Development & Deployment

### Prerequisites
- Node.js 18+ (LTS)
- npm
- PostgreSQL 14+ (or Supabase instance)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
# Create apps/web/.env.local (see env vars table above)
# Create apps/server/.env (see env vars table above)

# 3. Push database schema
npm run db:push

# 4. Start development
npm run dev
# Web: http://localhost:3000
# API: http://localhost:4001
```

### Available Commands (root)

| Command | Description |
|---------|-------------|
| `npm run dev` | Build DB package, run web + server concurrently |
| `npm run dev:web` | Next.js dev server only |
| `npm run dev:server` | Express dev server only (with nodemon) |
| `npm run db:push` | Push Drizzle schema to PostgreSQL |
| `npm run build` | Build all workspaces for production |
| `npm run lint` | ESLint across workspaces |

### Docker

Both `apps/web` and `apps/server` have Dockerfiles for production builds. The web Dockerfile builds the Next.js standalone output; the server Dockerfile compiles TypeScript.

### Production Notes

- Next.js standalone output requires the `@connext/db` and `@connext/types` workspace packages to be built first
- Express server should be run behind a reverse proxy (nginx, Caddy) for production
- WebSocket connections require the proxy to support WebSocket upgrade headers
- PostgreSQL connection pooling (max 10 connections via `postgres` driver)
- All httpOnly cookies should use `secure: true` and `sameSite: 'none'` in production
- Firebase FCM requires a service account JSON — the private key is passed as `FCM_PRIVATE_KEY` with `\n` for newlines
