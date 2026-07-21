# Connext technical documentation

This document describes what the current code does. It separates user-facing features from server routes and encryption work that are present in the repository but not yet connected to the web interface.

## Product and scope

Connext is a PostgreSQL-backed, one-to-one messaging application. People can create a username-and-password account or use configured Google OAuth or email-code sign-in. After sign-in, they can find people, establish a connection through a request or invite link, and exchange text messages in real time.

The current project does not use wallets, blockchain, Solana, EVM, or smart contracts. Those terms belong to an earlier version of the repository and should not be used to describe this application.

## End-to-end encryption status

Connext does **not** run E2EE. `apps/web/src/app/chat/ChatClient.tsx` sends the draft text in `content` through Socket.IO. Its fallback sends the same `content` field to `POST /chat/send-message`. The server stores it in `message.content` and returns it as readable text for both live delivery and history.

The repository includes inactive E2EE scaffolding:

- `apps/web/src/lib/crypto.ts` creates RSA-OAEP key pairs and encrypts or decrypts text with Web Crypto.
- `user.publicKey` and `POST /auth/public-key` can store a public key.
- `message.encryptedContent` and `message.encryptedContentForSender` can store encrypted payloads.

These helpers are not imported by onboarding or the chat client. No key pair is generated or uploaded, and the server renders encrypted content as text rather than decrypting it. E2EE is planned work, not an implemented security property.

HTTPS and WSS can protect traffic in transit in a secure deployment. They do not stop the server or database administrators from reading messages at rest.

## Architecture

| Workspace | Responsibility | Main technologies |
| --- | --- | --- |
| `apps/web` | Browser UI, Auth.js, onboarding, dashboard, requests, and chat | Next.js 15, React 19, Tailwind CSS, Socket.IO client |
| `apps/server` | REST API, Socket.IO, sessions, media, and notifications | Express 4, Socket.IO 4, JWT, Helmet, multer |
| `packages/db` | Schema, Drizzle client, room utilities, and password hashing | PostgreSQL, Drizzle ORM |
| `packages/types` | Shared public TypeScript interfaces | TypeScript |

The root scripts build `packages/db` before they start or build the applications. Development uses port `3000` for the web app and `4001` for the API.

## Authentication and sessions

### Account options

- Username and password: no email is required. Usernames are 3–24 lowercase letters, numbers, or underscores; passwords need at least eight characters.
- Email or username and password: handled by the Auth.js Credentials provider.
- Google OAuth: enabled only when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set.
- Email code: a six-digit SMTP code valid for ten minutes when `EMAIL_SERVER` is set.
- Password recovery: the email-code flow creates a recovery session, then `/reset-password` calls `POST /auth/update-password`.

Passwords use a random salt with Node `scrypt` and timing-safe verification.

### Web-to-API bridge

1. Auth.js signs the person in to the web app.
2. `/api/auth/bridge` creates a payload with the user ID and profile fields, valid for 60 seconds, and signs it with HMAC-SHA256 using `AUTH_SECRET`.
3. The browser posts it to `POST /auth/bridge` on Express.
4. Express verifies the signature, upserts the user, and creates an `httpOnly` `token` cookie signed with `JWT_SECRET`.
5. Protected REST routes and Socket.IO use that cookie; Socket.IO also accepts `handshake.auth.token`.

`AUTH_SECRET` must be the same in the web and server deployments. Use a separate strong `JWT_SECRET` for API sessions.

## Messaging flow

1. A signed-in person searches by username, email, or exact user ID.
2. They send a request; the recipient accepts or rejects it. A mutual request is accepted automatically.
3. An accepted pair receives a stable room ID made by sorting the user IDs and joining them with `_`.
4. The chat page loads history, opens Socket.IO, joins the room, and sends text through `send_message`.
5. The server verifies the sender, recipient, and accepted connection, then persists and emits the message.
6. The receiving client sends delivery and read acknowledgements; the sender UI changes from sent to delivered to read.

The REST send route persists a fallback message but does not broadcast it itself. The Socket.IO path is the real-time path used by the current interface.

Presence is an in-memory map of socket IDs. It is not shared between server processes and clears on restart. A socket may send one message every 500 ms.

## Data model

The schema lives in `packages/db/src/schema.ts`.

| Table | Purpose |
| --- | --- |
| `user` | Auth.js identity fields, username, password hash, profile fields, optional public key, and optional FCM token |
| `account`, `session`, `verificationToken` | Auth.js adapter tables |
| `message` | Sender, room ID, plaintext content, inactive encrypted-content fields, read state, and delivery timestamp |
| `chat_request` | Connection participants, pending/accepted state, custom names, and hidden state |
| `invite` | Random invite token, creator, expiry, and the most recent accepter |

Invites expire after seven days and are reusable. Each accepter receives or reactivates their own accepted connection with the creator.

## Feature matrix

| Capability | Status in the web UI | Notes |
| --- | --- | --- |
| Account creation, sign-in, onboarding, recovery | Available | Google and email-code providers require configuration |
| Search and connection requests | Available | An accepted connection is required before messaging |
| Invite links | Available | Generated links are valid for seven days |
| Text chat, history, unread counts, receipts | Available | Text is plaintext to the server |
| Browser notifications | Available | Live Socket.IO notifications while the app is open |
| Media uploads/downloads | API only | R2 routes and helpers exist; chat has no attachment UI |
| FCM notifications | API only | The web UI does not register tokens or send FCM notifications |
| Contact rename/disconnect | API only | Endpoints exist without checked-in controls |
| Typing status | API only | Socket events exist without a client implementation |
| End-to-end encryption | Not implemented | Helpers and fields exist but are unused |

## HTTP API

All routes except the health check and auth bridge require the API JWT cookie.

| Area | Route | Purpose |
| --- | --- | --- |
| Health | `GET /health` | Process health response |
| Auth | `POST /auth/bridge` | Verify the Auth.js bridge and create an API session |
| Auth | `GET /auth/session`, `POST /auth/logout` | Read or end the API session |
| Auth | `POST /auth/username`, `POST /auth/update-password` | Maintain profile and password |
| Auth | `POST /auth/public-key`, `POST /auth/fcm-token` | Store public key or FCM token |
| Auth | `GET /auth/user/:query`, `GET /auth/search` | Search people |
| Chat | `POST /chat/request`, `POST /chat/respond`, `GET /chat/requests`, `DELETE /chat/request/:requestId` | Manage connections |
| Chat | `GET /chat/messages/:roomId`, `POST /chat/send-message`, `GET /chat/unreadCounts` | History, fallback sending, and unread counts |
| Chat | `PUT /chat/contact-name`, `POST /chat/disconnect`, `GET /chat/online-status/:userId` | Contact and presence operations |
| Chat | `POST /chat/invite`, `POST /chat/invite/accept` | Create and accept invites |
| Media | `POST /media/sign-upload`, `POST /media/sign-download`, `POST /media/upload` | R2 media endpoints |
| Notifications | `POST /notifications/send` | FCM notification endpoint |

## Configuration and operations

Use `apps/web/.env.local` and `apps/server/.env` for local configuration. They are ignored by Git.

| Variable | Used by | Notes |
| --- | --- | --- |
| `DATABASE_URL` | web, server | PostgreSQL connection string |
| `AUTH_SECRET` | web, server | Shared Auth.js and bridge signing key |
| `JWT_SECRET` | server | Required in production; signs API cookies |
| `JWT_EXPIRES_DAYS` | server | Defaults to `7d` |
| `NEXT_PUBLIC_SERVER_URL` | web | API base URL |
| `PORT`, `ALLOWED_ORIGINS` | server | Port and production CORS allowlist |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | web | Google OAuth |
| `EMAIL_SERVER`, `EMAIL_FROM` | web | SMTP email-code provider |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | server | R2 media API |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | server | FCM API |

```bash
npm install
npm run db:push
npm run dev

# Individual services and checks
npm run dev:web
npm run dev:server
npm run build
npm run lint
```

There is no automated test suite yet. The server checks its PostgreSQL connection before binding its port, so a running application needs a reachable database.

At the current revision, `npm run lint --workspace=connext-web` fails before linting because the legacy `next lint` command cannot serialize `apps/web/.eslintrc.json`. The lint setup needs migration to the ESLint CLI.

## Safeguards and limitations

- Production enables Helmet and uses `ALLOWED_ORIGINS` for CORS.
- `/auth` and `/chat` have a limit of 1,000 requests per IP per 15 minutes.
- JSON bodies are limited to 10 KB.
- API cookies are `httpOnly`; production cookies are `Secure` with `SameSite=None`.
- Accepted chat connections are checked before history, message persistence, media download signing, and FCM delivery.
- The signed-upload endpoint applies `MAX_MEDIA_FILE_BYTES`; the proxy upload endpoint does not apply that configured limit itself.
- E2EE and automated tests are not implemented.

## Recommended next work

1. Wire E2EE through onboarding, key storage, sending, receiving, attachments, and multi-device recovery, then have the design independently reviewed.
2. Integrate or remove the unused R2, FCM, typing, and contact-management paths so the UI and server offer the same product.
3. Add automated tests for authentication, connection authorization, history access, and Socket.IO events.
4. Keep local environment files and every `settings.json` containing personal configuration out of version control.
