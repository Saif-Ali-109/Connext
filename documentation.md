# Connext Technical Documentation

This document provides a technical overview of the architecture, data models, routes, and features implemented in Connext.

## Architecture & Monorepo Structure

Connext is structured as an npm-workspaces monorepo:

| Workspace | Responsibility | Primary Stack |
| --- | --- | --- |
| `apps/web` | Browser UI, NextAuth authentication, onboarding, dashboard, requests, and chat client | Next.js 15, React 19, Tailwind CSS, Socket.IO Client |
| `apps/server` | Express REST API, Socket.IO server, session bridge, and notifications | Express 4, Socket.IO 4, JWT, Helmet |
| `packages/db` | Database Schema, Drizzle ORM client, password hashing, and room utilities | PostgreSQL, Drizzle ORM, Scrypt |
| `packages/types` | Shared public TypeScript types | TypeScript |

## Features & Authentication Flow

### Authentication Options
- **Username & Password**: Sign up without requiring an email address.
- **Email & Password**: Traditional account access.
- **Google OAuth 2.0**: Enabled when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are provided.
- **Email Verification Code**: 6-digit verification code sent via SMTP (`EMAIL_SERVER`).
- **Password Reset**: OTP flow allowing secure password updates.

### Web-to-API Session Bridge
1. NextAuth handles client-side authentication on the Next.js app.
2. `/api/auth/bridge` issues an HMAC-SHA256 signed payload valid for 60 seconds.
3. The browser posts this payload to Express `POST /auth/bridge`.
4. Express verifies signature and sets an `httpOnly` JWT session cookie used for subsequent REST calls and Socket.IO connections.

## Data Model

Database schema definition lives in `packages/db/src/schema.ts`:

- `user`: Identity details, username, password hash, profile information, last seen timestamp.
- `account`, `session`, `verificationToken`: Auth.js adapter management tables.
- `message`: Sender ID, Room ID, text content, read boolean, delivered timestamp.
- `chat_request`: Pair relationships, connection status (`pending`, `accepted`), custom display names.
- `invite`: 7-day reusable invitation tokens.

## Real-Time Messaging Workflow

1. Users search for contacts by username or email.
2. A request is sent and accepted (or auto-accepted on mutual requests).
3. Room IDs are generated consistently by sorting user IDs: `min(userId1, userId2)_max(userId1, userId2)`.
4. Socket.IO manages real-time message delivery and status acknowledgements (`sent` -> `delivered` -> `read`).

## Development & Deployment Commands

```bash
npm install
npm run db:push
npm run dev
npm run build
npm run lint
```
