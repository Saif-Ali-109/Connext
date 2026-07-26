---
title: Architecture
description: How Connext is put together, for quick orientation. For deeper technical notes see documentation.md; for decisions and gotchas see MEMORY.md.
---

# Architecture

How Connext is put together, for quick orientation. For deeper technical notes see
`documentation.md`; for decisions and gotchas see `MEMORY.md`.

## Monorepo layout

npm workspaces:

```
apps/
  web/      Next.js 15 + React 19 frontend & NextAuth UI (Socket.IO client)
  server/   Express 4 REST API + Socket.IO 4 server (JWT, Helmet)
packages/
  db/       PostgreSQL schema & Drizzle client
  types/    Shared TypeScript types
```

## apps/server (`apps/server/src`)

- `routes/` — `auth.ts`, `chat.ts`, `media.ts`, `notifications.ts` (Express routers).
- `controllers/` — matching request handlers: `auth.controller.ts`, `chat.controller.ts`,
  `media.controller.ts`, `notification.controller.ts`.
- `middleware/` — auth/JWT and request middleware.
- `lib/` — `bridge.ts` (HMAC session bridge → JWT cookie), `env.ts`, `constants.ts`,
  `r2.ts` (Cloudflare R2 media, optional), `fcm.ts` (Firebase push, optional).
- `scripts/` — maintenance/dev scripts.

## apps/web (`apps/web/src`)

- `app/` — Next.js App Router routes: `login`, `onboarding`, `connect`, `dashboard`,
  `requests`, `chat`, `invite`, `reset-password`, plus `api/` (incl. the NextAuth handler and
  `/api/auth/bridge`), `layout.tsx`, and `page.tsx` (home).
- `components/` — UI components (incl. shared motion primitives in `components/ui`).
- `lib/` — client helpers (API client, socket, auth).
- `styles/`, `types/`, `public/`.

## packages/db (`packages/db/src`)

- `schema.ts` — Drizzle tables: `user`, `account`, `session`, `verificationToken`, `message`,
  `chat_request`, `invite`.
- `client.ts` — Drizzle/Postgres client.
- `password.ts` — Scrypt password hashing.
- `index.ts` — package exports.

## packages/types

- `index.ts` — shared public TypeScript types consumed by web and server.

## Core flows

- **Auth bridge:** NextAuth authenticates in the web app → `/api/auth/bridge` issues an
  HMAC-SHA256 payload (valid 60s) → posted to Express `POST /auth/bridge` → Express verifies and
  sets an httpOnly JWT cookie used for REST + Socket.IO.
- **Messaging:** search user → send/accept chat request → deterministic room ID
  (`min_max` of user IDs) → Socket.IO delivers messages with `sent → delivered → read` receipts.
- **Data:** all persisted via Drizzle to PostgreSQL. Messages are currently PLAINTEXT (E2EE not
  wired up — see `MEMORY.md`).
