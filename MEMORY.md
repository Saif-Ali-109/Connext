---
title: Memory
description: Long-term project memory for Connext. Read this first on a fresh session. It captures the context, decisions, conventions, and gotchas that are NOT obvious from the code alone.
---

# Memory

Long-term project memory for Connext. Read this first on a fresh session. It captures the
context, decisions, conventions, and gotchas that are NOT obvious from the code alone.

For live task status see `progress.md`. For history see `SESSION_LOG.md`. For open work see
`TODO.md`. For how the code fits together see `ARCHITECTURE.md`.

## What Connext is

A real-time, one-to-one chat web app. Users register (username/password, email/password, or
Google OAuth), find each other by username/email, send & accept connection requests, then chat
in real time with sent/delivered/read receipts and browser notifications.

## Key decisions

- **Monorepo** via npm workspaces: `apps/web`, `apps/server`, `packages/db`, `packages/types`.
- **Database is PostgreSQL + Drizzle ORM.** The project was migrated off Mongoose/MongoDB —
  do NOT reintroduce Mongo patterns or models.
- **Two auth systems bridged.** NextAuth (Auth.js v5) authenticates in the web app; an
  HMAC-signed, 60-second bridge payload is exchanged for a stateless Express JWT cookie used by
  the REST API and Socket.IO. See `apps/server/src/lib/bridge.ts`.
- **Room IDs are deterministic:** `min(userId1,userId2)_max(userId1,userId2)`. Always derive a
  room ID this way so both users resolve to the same room.
- **Realtime is Socket.IO 4** with automatic fallback; message status flows `sent → delivered → read`.

## Gotchas / things to know

- **E2EE is scaffolding only.** RSA-OAEP helpers, a public-key endpoint, and encrypted-content
  columns exist, but messages are currently sent and stored as PLAINTEXT. Do not claim the app
  is end-to-end encrypted. Wiring it up is a pending task.
- **Optional integrations degrade gracefully:** Google OAuth (needs `AUTH_GOOGLE_*`), SMTP email
  codes (`EMAIL_SERVER`), Cloudflare R2 media (S3-compatible), and FCM push are all optional and
  gated behind env vars.
- **Secrets:** there is a known leaked Anthropic API key in `.claude/settings.json` that must be
  rotated and kept out of git (tracked in TODO). Never commit secrets.
- **Env split:** web reads `apps/web/.env.local`; server reads `apps/server/.env`. Both need
  `DATABASE_URL` and `AUTH_SECRET`; server also needs `JWT_SECRET`.

## Conventions

- TypeScript everywhere; shared public types live in `packages/types`.
- Keep `progress.md`, `SESSION_LOG.md`, and `TODO.md` current as work is done.
- Match existing code style; prefer the existing lib helpers over new dependencies.
