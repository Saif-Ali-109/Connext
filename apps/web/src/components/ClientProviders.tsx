'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import React, { ReactNode, Suspense, createContext, useContext, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getApiBaseUrl } from '../lib/api';
import { ToastProvider } from './ui/Toast';

const NotificationManager = dynamic(() => import('./NotificationManager'), {
  ssr: false,
});

export interface ServerProfile {
  id: string;
  email?: string | null;
  name?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  publicKey?: string | null;
  hasPassword?: boolean;
  emailVerified?: string | null;
}

interface BridgeContextValue {
  ready: boolean;
  /** True once bridge attempt finished (success or failure). */
  settled: boolean;
  error: string | null;
  userId: string | null;
  profile: ServerProfile | null;
  refreshProfile: () => Promise<ServerProfile | null>;
  retryBridge: () => void;
}

const BridgeContext = createContext<BridgeContextValue>({
  ready: false,
  settled: false,
  error: null,
  userId: null,
  profile: null,
  refreshProfile: async () => null,
  retryBridge: () => {},
});

/** Access the Express API session: whether the bridge cookie is set and the server-side profile. */
export function useBridge() {
  return useContext(BridgeContext);
}

/** Paths that must never trigger the onboarding redirect. */
const PUBLIC_PATHS = ['/login', '/onboarding', '/reset-password'];

function BridgeSession({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ServerProfile | null>(null);
  const [attempt, setAttempt] = useState(0);

  const fetchProfile = useCallback(async (): Promise<ServerProfile | null> => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/session`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.user as ServerProfile) ?? null;
    } catch {
      return null;
    }
  }, []);

  // If already authenticated and on the login page, redirect immediately
  // without waiting for the bridge flow. This saves 2-5 seconds on redirects.
  useEffect(() => {
    if (status === 'authenticated' && pathname === '/login') {
      const rawCallbackUrl = searchParams.get('callbackUrl');
      const callbackUrl =
        typeof rawCallbackUrl === 'string' && rawCallbackUrl.startsWith('/') && !rawCallbackUrl.startsWith('//')
          ? rawCallbackUrl
          : '/dashboard';
      router.replace(callbackUrl);
    }
  }, [status, pathname, router, searchParams]);

  // Establish the Express token cookie via the bridge, then load the server profile.
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) {
      if (status === 'unauthenticated') {
        setReady(false);
        setSettled(true);
        setProfile(null);
        setError(null);
      }
      return;
    }

    let cancelled = false;
    setReady(false);
    setSettled(false);
    setError(null);

    void (async () => {
      try {
        const signed = await fetch('/api/auth/bridge', { credentials: 'include' });
        if (!signed.ok) {
          if (!cancelled) {
            setError('Could not create a session bridge. Try signing in again.');
            setSettled(true);
          }
          return;
        }
        const body = await signed.json();

        const bridgeRes = await fetch(`${getApiBaseUrl()}/auth/bridge`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!bridgeRes.ok) {
          const detail = await bridgeRes.json().catch(() => null);
          if (!cancelled) {
            setError(
              (detail && typeof detail.error === 'string' && detail.error) ||
                `Backend bridge failed (${bridgeRes.status}). Check AUTH_SECRET matches on both services.`
            );
            setSettled(true);
          }
          return;
        }

        const bridged = await bridgeRes.json();
        if (cancelled) return;

        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_user_id', session.user!.id!);
        }
        setProfile((bridged.user as ServerProfile) ?? null);
        setReady(true);
        setError(null);
        setSettled(true);
      } catch (err) {
        console.error('[bridge]', err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : `Unable to reach API at ${getApiBaseUrl()}.`
          );
          setSettled(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, status, attempt]);

  useEffect(() => {
    if (!ready || !profile) return;

    // Already logged in — login page is pointless.
    if (pathname === '/login') {
      router.replace('/dashboard');
      return;
    }

    // Force through onboarding until they have a username. Google users get one
    // auto-assigned at bridge time, so they skip straight to the app; password is
    // optional (Google sign-in) and no longer gates entry.
    if (PUBLIC_PATHS.includes(pathname)) return;
    if (!profile.username) {
      router.replace('/onboarding');
    }
  }, [ready, profile, pathname, router]);

  const refreshProfile = useCallback(async () => {
    const fresh = await fetchProfile();
    if (fresh) setProfile(fresh);
    return fresh;
  }, [fetchProfile]);

  const retryBridge = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return (
    <BridgeContext.Provider
      value={{
        ready,
        settled,
        error,
        userId: session?.user?.id ?? null,
        profile,
        refreshProfile,
        retryBridge,
      }}
    >
      {children}
    </BridgeContext.Provider>
  );
}

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Suspense>
        <BridgeSession>
          <ToastProvider>
            <NotificationManager />
            {children}
          </ToastProvider>
        </BridgeSession>
      </Suspense>
    </SessionProvider>
  );
}
