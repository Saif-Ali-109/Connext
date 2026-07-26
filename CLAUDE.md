# Connext

Connext is a real-time, one-to-one chat web application that lets users connect and message each other instantly. Users register (via username/password, email/password, or Google OAuth), discover others by username or email, send and accept connection requests, and then chat in real time with live delivery/read receipts and browser notifications.

## Stack

It is an npm-workspaces monorepo:

| Workspace | Responsibility | Stack |
| --- | --- | --- |
| `apps/web` | Frontend web client & NextAuth UI | Next.js 15, React 19, Tailwind CSS, Socket.IO Client |
| `apps/server` | Backend REST API & Socket.IO server | Express 4, Socket.IO 4, JWT, Helmet |
| `packages/db` | Database schema & client | PostgreSQL, Drizzle ORM |
| `packages/types` | Shared TypeScript types | TypeScript |

## Purpose of this file

This file tracks specifications and planned updates for the project. New feature specs and change requirements will be documented here as the project evolves.
