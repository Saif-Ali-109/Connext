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

export default function ResetPasswordPage() {
  const router = useRouter();
  const { status } = useSession();
  const { ready, refreshProfile } = useBridge();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The recovery OTP already signed the user in; bounce anyone who isn't.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
      const res = await fetch(`${SERVER_URL}/auth/update-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');
      await refreshProfile();
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
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
          <h1 className="text-3xl font-semibold tracking-tight">Set a new password</h1>
          <p className="text-text-secondary text-sm">
            Choose a new password for your account. You&apos;ll use it to sign in next time.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs uppercase text-text-muted">New password</label>
            <PasswordInput
              themed
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
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
            disabled={busy || password.length < 8 || password !== confirm}
            className="w-full py-3"
          >
            {busy ? 'Saving…' : 'Save password'}
          </AnimatedButton>
        </form>
      </motion.div>
    </main>
  );
}
