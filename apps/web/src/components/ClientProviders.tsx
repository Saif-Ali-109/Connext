'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import React, { ReactNode, createContext, useContext, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getApiBaseUrl } from '../lib/api';

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
}

interface BridgeContextValue {
  ready: boolean;
  userId: string | null;
  profile: ServerProfile | null;
  refreshProfile: () => Promise<ServerProfile | null>;
}

const BridgeContext = createContext<BridgeContextValue>({
  ready: false,
  userId: null,
  profile: null,
  refreshProfile: async () => null,
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
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<ServerProfile | null>(null);

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

  // Establish the Express token cookie via the bridge, then load the server profile.
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) {
      if (status === 'unauthenticated') {
        setReady(false);
        setProfile(null);
      }
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const signed = await fetch('/api/auth/bridge', { credentials: 'include' });
        if (!signed.ok) return;
        const body = await signed.json();

        const bridgeRes = await fetch(`${getApiBaseUrl()}/auth/bridge`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!bridgeRes.ok) return;

        const bridged = await bridgeRes.json();
        if (cancelled) return;

        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_user_id', session.user!.id!);
        }
        setProfile((bridged.user as ServerProfile) ?? null);
        setReady(true);
      } catch (err) {
        console.error('[bridge]', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, status]);

  // Force users through onboarding until they have both a username and a
  // password (so email + password sign-in works next time). Applies to Google
  // and email sign-in alike, including pre-existing accounts with no password.
  useEffect(() => {
    if (!ready || !profile) return;
    if (PUBLIC_PATHS.includes(pathname)) return;
    if (!profile.username || !profile.hasPassword) {
      router.replace('/onboarding');
    }
  }, [ready, profile, pathname, router]);

  const refreshProfile = useCallback(async () => {
    const fresh = await fetchProfile();
    if (fresh) setProfile(fresh);
    return fresh;
  }, [fetchProfile]);

  return (
    <BridgeContext.Provider
      value={{ ready, userId: session?.user?.id ?? null, profile, refreshProfile }}
    >
      {children}
    </BridgeContext.Provider>
  );
}

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <BridgeSession>
        <NotificationManager />
        {children}
      </BridgeSession>
    </SessionProvider>
  );
}
