'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useBridge } from '../../components/ClientProviders';
import { getApiBaseUrl } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';
import { AnimatedButton, Spinner } from '../../components/ui/motion';

const SERVER_URL = getApiBaseUrl();
const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export default function OnboardingPage() {
  const router = useRouter();
  const { status } = useSession();
  const { ready, profile, refreshProfile } = useBridge();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // Fully set up (username + password) — nothing to do here.
  useEffect(() => {
    if (ready && profile?.username && profile?.hasPassword) router.replace('/dashboard');
  }, [ready, profile, router]);

  // Pre-fill the username for accounts that have one but still need a password.
  useEffect(() => {
    if (ready && profile?.username && !username) setUsername(profile.username);
  }, [ready, profile, username]);

  const normalized = username.trim().toLowerCase();
  const valid = USERNAME_RE.test(normalized);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError('Username must be 3-24 chars: lowercase letters, numbers, underscore.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/auth/username`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: normalized,
          displayName: displayName.trim() || undefined,
          password,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError('That username is already taken. Try another.');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to save username');
      await refreshProfile();
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save username');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading' || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-primary">
        <Spinner />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-10 bg-background-primary text-text-primary">
      {/* Soft violet glow, tuned via theme-aware accent alpha. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
        animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-md space-y-6 rounded-2xl border border-border bg-background-secondary/60 p-6 backdrop-blur-sm shadow-xl"
      >
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Choose a username</h1>
          <p className="text-text-secondary text-sm">
            Pick a unique username so other people can find you and start a chat.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs uppercase text-text-muted">Username</label>
            <div className="flex items-center rounded-xl border border-border bg-input-bg px-3 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
              <span className="text-text-muted">@</span>
              <input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_username"
                className="flex-1 bg-transparent px-2 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none"
              />
            </div>
            <p className="text-xs text-text-muted">
              3-24 characters. Lowercase letters, numbers, and underscores only.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase text-text-muted">Display name (optional)</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={profile?.name || 'How your name appears in chats'}
              className="w-full rounded-xl border border-border bg-input-bg px-3 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase text-text-muted">Password</label>
            <PasswordInput
              themed
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            <p className="text-xs text-text-muted">
              You&apos;ll use your email and this password to sign in next time.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase text-text-muted">Confirm password</label>
            <PasswordInput
              themed
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
              autoComplete="new-password"
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="text-sm text-red-400"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatedButton
            type="submit"
            disabled={busy || !valid || password.length < 8 || password !== confirm}
            className="w-full py-3"
          >
            {busy ? 'Saving…' : 'Continue'}
          </AnimatedButton>
        </form>
      </motion.div>
    </main>
  );
}
