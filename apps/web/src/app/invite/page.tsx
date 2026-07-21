'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { getApiBaseUrl } from '../../lib/api';
import { Spinner } from '../../components/ui/motion';

const SERVER_URL = getApiBaseUrl();

type Phase = 'working' | 'success' | 'error';

function InviteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [message, setMessage] = useState('Processing invite…');
  const [phase, setPhase] = useState<Phase>('working');

  const acceptInvite = useCallback(async () => {
    const token = searchParams.get('token') || searchParams.get('key');
    if (!token) {
      setPhase('error');
      setMessage('No invite token provided');
      return;
    }

    if (status === 'unauthenticated') {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/invite?token=${token}`)}`);
      return;
    }
    if (status !== 'authenticated') return;

    try {
      const res = await fetch(`${SERVER_URL}/chat/invite/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to accept invite');
      setPhase('success');
      setMessage('Invite accepted! Redirecting…');
      setTimeout(() => router.push(`/chat/${data.roomId}`), 1200);
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [router, searchParams, status]);

  useEffect(() => {
    void acceptInvite();
  }, [acceptInvite]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background-primary text-text-primary">
      <div className="text-center space-y-4">
        <div className="flex h-12 items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={phase}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2 }}
            >
              {phase === 'working' ? (
                <Spinner className="h-8 w-8" />
              ) : phase === 'success' ? (
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              ) : (
                <XCircle className="h-10 w-10 text-red-500" />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="text-lg"
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background-primary">
          <Spinner />
        </div>
      }
    >
      <InviteInner />
    </Suspense>
  );
}
