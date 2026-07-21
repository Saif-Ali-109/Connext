'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AtSign, KeyRound, Loader2, Mail, ShieldCheck, UserCircle2 } from 'lucide-react';
import PasswordInput from '@/components/PasswordInput';

// Top-level tabs the user toggles between.
type Tab = 'signin' | 'signup';
// The concrete screen shown inside a tab. Email-code request/entry is shared by
// both new-account signup and password recovery, distinguished by `codeGoal`.
type Screen =
  | 'signin'
  | 'signup-email'
  | 'signup-anon'
  | 'code-request'
  | 'code-entry';
// Why we're collecting an email code: create a new account, or recover access.
type CodeGoal = 'signup' | 'recovery';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

const cardMotion = {
  initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -12, filter: 'blur(4px)' },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

/** Field with a leading icon, matching the glassy theme. */
function IconField({
  icon,
  ...props
}: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 transition focus-within:border-violet-400/60 focus-within:bg-white/10 focus-within:ring-2 focus-within:ring-violet-500/20">
      <span className="text-zinc-400">{icon}</span>
      <input
        {...props}
        className="flex-1 bg-transparent py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
      />
    </div>
  );
}

/** Primary gradient action button with hover/press animation. */
function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button
      whileHover={{ scale: props.disabled ? 1 : 1.02 }}
      whileTap={{ scale: props.disabled ? 1 : 0.98 }}
      {...(props as React.ComponentProps<typeof motion.button>)}
      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('signin');
  const [codeGoal, setCodeGoal] = useState<CodeGoal>('signup');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTab: Tab =
    screen === 'signup-email' || screen === 'signup-anon' ? 'signup' : 'signin';

  function go(next: Screen) {
    setScreen(next);
    setError(null);
  }

  function switchTab(tab: Tab) {
    go(tab === 'signin' ? 'signin' : 'signup-email');
  }

  // Returning users: email or username + password.
  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn('credentials', {
        identifier: identifier.trim(),
        password,
        redirect: false,
      });
      if (result?.error) {
        setError('Incorrect email/username or password.');
        return;
      }
      router.replace('/dashboard');
    } catch {
      setError('Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // Anonymous signup: username + password only, no email involved.
  async function onSignupSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = username.trim().toLowerCase();
    if (!USERNAME_RE.test(normalized)) {
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
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalized, password }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError('That username is already taken. Try another.');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not create the account.');

      const result = await signIn('credentials', {
        identifier: normalized,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError('Account created, but sign-in failed. Try signing in with your username.');
        return;
      }
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  }

  // Email code: used both to start a new account (signup) and to recover access
  // when a password is forgotten. `codeGoal` decides where verification lands.
  async function onCodeRequest(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn('nodemailer', {
        email: email.trim(),
        redirect: false,
      });
      if (result?.error) {
        setError('Could not send a code. Check the email address and try again.');
        return;
      }
      go('code-entry');
    } catch {
      setError('Could not send a code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // Verifying the code signs in THIS device. New signups continue to onboarding
  // to pick a username + password; recovery users go to reset-password to set a
  // new password before landing on the dashboard.
  function onCodeSubmit(e: FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError(null);
    const params = new URLSearchParams({
      token,
      email: email.trim(),
      callbackUrl: codeGoal === 'recovery' ? '/reset-password' : '/onboarding',
    });
    window.location.href = `/api/auth/callback/nodemailer?${params.toString()}`;
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-zinc-100">
      {/* Animated aurora backdrop — replaces the flat black background. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-fuchsia-600/30 blur-3xl"
        animate={{ x: [0, -40, 0], y: [0, -30, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8"
      >
        <div className="space-y-1 text-center">
          <h1 className="bg-gradient-to-r from-indigo-300 via-violet-200 to-fuchsia-300 bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
            Connext
          </h1>
          <p className="text-sm text-zinc-400">
            {activeTab === 'signin' ? 'Welcome back — sign in to continue.' : 'Create your account in seconds.'}
          </p>
        </div>

        {/* Segmented Sign In / Sign Up switch with an animated indicator. */}
        <div className="relative grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1 text-sm font-medium">
          {(['signin', 'signup'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => switchTab(tab)}
              className={`relative z-10 rounded-lg py-2 transition-colors ${
                activeTab === tab ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {activeTab === tab && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-violet-900/30"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              {tab === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 hover:shadow-lg hover:shadow-white/10"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
          </svg>
          Continue with Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wide">
            <span className="bg-transparent px-2 text-zinc-500 backdrop-blur">
              {activeTab === 'signin' ? 'or sign in with' : 'or sign up with'}
            </span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {screen === 'signin' && (
            <motion.form key="signin" {...cardMotion} onSubmit={onPasswordSubmit} className="space-y-3">
              <IconField
                icon={<UserCircle2 className="h-4 w-4" />}
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Email or username"
                autoComplete="username"
              />
              <PasswordInput
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setCodeGoal('recovery');
                    go('code-request');
                  }}
                  className="text-xs font-medium text-violet-300 transition hover:text-violet-200"
                >
                  Forgot password?
                </button>
              </div>
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {busy ? 'Signing in…' : 'Sign in'}
              </PrimaryButton>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </motion.form>
          )}

          {screen === 'signup-email' && (
            <motion.div key="signup-email" {...cardMotion} className="space-y-4">
              <form onSubmit={onCodeRequest} className="space-y-3">
                <p className="text-sm text-zinc-400">
                  Enter your email and we&apos;ll send a 6-digit code. You&apos;ll pick a username
                  and password next.
                </p>
                <IconField
                  icon={<Mail className="h-4 w-4" />}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <PrimaryButton
                  type="submit"
                  disabled={busy}
                  onClick={() => setCodeGoal('signup')}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {busy ? 'Sending…' : 'Email me a code'}
                </PrimaryButton>
                {error && <p className="text-sm text-red-400">{error}</p>}
              </form>

              <button
                type="button"
                onClick={() => go('signup-anon')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 py-3 text-sm font-medium text-violet-200 transition hover:border-violet-400/60 hover:bg-violet-500/20"
              >
                <ShieldCheck className="h-4 w-4" />
                Sign up anonymously (no email)
              </button>
            </motion.div>
          )}

          {screen === 'signup-anon' && (
            <motion.form key="signup-anon" {...cardMotion} onSubmit={onSignupSubmit} className="space-y-3">
              <p className="text-sm text-zinc-400">
                No email needed — pick a username and password and you&apos;re in. Just don&apos;t
                lose the password: without an email there&apos;s no way to recover the account.
              </p>
              <IconField
                icon={<AtSign className="h-4 w-4" />}
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_username"
                autoComplete="username"
              />
              <PasswordInput
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (at least 8 characters)"
                autoComplete="new-password"
              />
              <PasswordInput
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {busy ? 'Creating account…' : 'Create anonymous account'}
              </PrimaryButton>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="button"
                onClick={() => go('signup-email')}
                className="w-full text-center text-xs text-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:underline"
              >
                Prefer to use an email instead?
              </button>
            </motion.form>
          )}

          {screen === 'code-request' && (
            <motion.form key="code-request" {...cardMotion} onSubmit={onCodeRequest} className="space-y-3">
              <p className="text-sm text-zinc-400">
                Enter your email and we&apos;ll send a 6-digit code to sign you back in.
              </p>
              <IconField
                icon={<Mail className="h-4 w-4" />}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <PrimaryButton type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {busy ? 'Sending…' : 'Email me a code'}
              </PrimaryButton>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="button"
                onClick={() => go('signin')}
                className="w-full text-center text-xs text-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:underline"
              >
                Back to sign in
              </button>
            </motion.form>
          )}

          {screen === 'code-entry' && (
            <motion.form key="code-entry" {...cardMotion} onSubmit={onCodeSubmit} className="space-y-3">
              <p className="text-sm text-zinc-400">
                We sent a 6-digit code to <span className="text-zinc-200">{email}</span>. Enter it
                below — you can read it on any device.
              </p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center text-lg tracking-[0.5em] text-zinc-100 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
              />
              <PrimaryButton type="submit" disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {busy ? 'Verifying…' : 'Verify code'}
              </PrimaryButton>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  setCode('');
                  go('code-request');
                }}
                className="w-full text-center text-xs text-zinc-400 underline-offset-2 transition hover:text-zinc-200 hover:underline"
              >
                Use a different email
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  );
}
