---
title: TODO / FIXME
description: Open work and things to fix. Mirrors the pending items in progress.md with more detail.
---

# TODO / FIXME

Open work and things to fix. Mirrors the `pending:` items in `progress.md` with more detail.
Move an item to "Done" (or delete it) once resolved, and record the change in `SESSION_LOG.md`.

## High priority

- [ ] **Rotate leaked API key** — a hardcoded Anthropic API key lives in `.claude/settings.json`.
      Rotate it, move it to an untracked env/secret, and ensure it's gitignored.
- [ ] **Fix open bug** — `bugs/bug.png` captures an untriaged issue. Triage it, reproduce, and fix.

## Features / follow-ups

- [ ] **Wire up E2EE** — connect the existing scaffolding: generate a key pair at onboarding,
      upload the public key, encrypt on send, decrypt on receive, so the server stops seeing
      plaintext. (Columns, RSA-OAEP helpers, and the public-key endpoint already exist.)
- [ ] **Automated tests** — no test suite exists. Add unit/integration tests and wire them into
      the workspace scripts (`npm run test`).

## Notes

- Keep this list in sync with `progress.md`'s `pending:` section.
