'use client';

import { useState } from 'react';
import { Check, Shield, Mail, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { getApiBaseUrl } from '../../lib/api';
import { AnimatedButton, PageShell, Spinner } from '../../components/ui/motion';

const SERVER_URL = getApiBaseUrl();

interface Props {
  email?: string | null;
  emailVerified?: string | null;
  onVerify: (user: { email: string; emailVerified: string }) => void;
}

type Step = 'idle' | 'sent' | 'verifying' | 'verified' | 'error';

export default function SecuritySection({ email, emailVerified, onVerify }: Props) {
  const [step, setStep] = useState<Step>(emailVerified ? 'verified' : 'idle');
  const [inputEmail, setInputEmail] = useState(email ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!inputEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputEmail)) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/auth/send-verification`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inputEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStep('sent');
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/auth/verify-email`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inputEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      setStep('verified');
      onVerify(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageShell>
        <h1 className="text-2xl font-semibold text-text-primary">Security</h1>
        <p className="text-sm text-text-secondary">Verify your email address for account security.</p>
      </PageShell>

      <div className="rounded-xl border border-border p-4 space-y-4 bg-background-primary/60 backdrop-blur-md">
        {step === 'verified' ? (
          <div className="flex items-center gap-3 py-2">
            <div className="rounded-full bg-emerald-600/20 p-2">
              <Check className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="font-medium text-text-primary">Email verified</p>
              <p className="text-sm text-text-muted">{email || inputEmail}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                {email ? 'Current email' : 'No email on file'} — {email ? email : 'Add one to enable verification'}
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inputEmail}
                  onChange={(e) => { setInputEmail(e.target.value); setStep('idle'); }}
                  placeholder="your@email.com"
                  disabled={step === 'sent'}
                  className="flex-1 rounded-lg border border-input-border bg-background-secondary px-3 py-2 text-sm disabled:opacity-50"
                />
                <AnimatedButton
                  onClick={sendCode}
                  disabled={busy || !inputEmail || step === 'sent'}
                  className="px-4 py-2 text-sm"
                >
                  {busy && step === 'idle' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send code'}
                </AnimatedButton>
              </div>
            </div>

            {step === 'sent' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-3 overflow-hidden"
              >
                <p className="text-sm text-text-secondary">
                  Enter the 6-digit code sent to {inputEmail}
                </p>
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="flex-1 rounded-lg border border-input-border bg-background-secondary px-3 py-2 text-sm tracking-[0.5em] text-center font-mono text-lg"
                  />
                  <AnimatedButton
                    onClick={verifyCode}
                    disabled={busy || code.length !== 6}
                    className="px-4 py-2 text-sm"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                  </AnimatedButton>
                </div>
                <button
                  onClick={() => { setStep('idle'); setError(null); }}
                  className="text-xs text-text-muted hover:text-accent"
                >
                  Change email & resend
                </button>
              </motion.div>
            )}

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
