'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '../../components/Navigation';
import InteractiveBackground from '../../components/ui/InteractiveBackground';
import { useSession } from 'next-auth/react';
import { useBridge } from '../../components/ClientProviders';
import { getApiBaseUrl } from '../../lib/api';
import Sidebar, { type Section } from './sidebar';
import ChatsSection from './ChatsSection';
import RequestsSection from './RequestsSection';
import ProfileSection from './ProfileSection';
import SecuritySection from './SecuritySection';
import {
  AnimatedButton,
  Spinner,
} from '../../components/ui/motion';

const SERVER_URL = getApiBaseUrl();

function DashboardContent() {
  const router = useRouter();
  const { status } = useSession();
  const { ready, settled, error: bridgeError, userId, profile, refreshProfile, retryBridge } = useBridge();

  const [section, setSection] = useState<Section>('chats');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [contacts, setContacts] = useState<any[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [incoming, setIncoming] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${SERVER_URL}/chat/requests`, { credentials: 'include' });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setContacts(data.contacts || []);
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  const fetchUnreadCounts = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${SERVER_URL}/chat/unreadCounts?userId=${userId}`, { credentials: 'include' });
      if (res.ok) setUnreadCounts(await res.json());
    } catch {}
  }, [userId]);

  useEffect(() => {
    if (ready && userId) {
      void fetchAll();
      void fetchUnreadCounts();
    } else if (settled && !ready) {
      setLoading(false);
    }
  }, [ready, settled, userId, fetchAll, fetchUnreadCounts]);

  useEffect(() => {
    const onFocus = () => {
      if (ready && userId) void fetchUnreadCounts();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [ready, userId, fetchUnreadCounts]);

  useEffect(() => {
    if (!ready || !userId) return;
    const interval = setInterval(() => { void fetchAll(); }, 30000);
    return () => clearInterval(interval);
  }, [ready, userId, fetchAll]);

  const pendingCount = useMemo(() => incoming.length, [incoming]);

  const respond = async (requestId: string, nextStatus: 'accepted' | 'rejected') => {
    setBusy(true);
    try {
      const res = await fetch(`${SERVER_URL}/chat/respond`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await fetchAll();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async (toUserId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${SERVER_URL}/chat/request`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessage('Request sent');
      await fetchAll();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (_user: { email: string; emailVerified: string }) => {
    await refreshProfile();
  };

  const saveProfile = async (data: { username?: string; displayName?: string }) => {
    setBusy(true);
    try {
      const res = await fetch(`${SERVER_URL}/auth/username`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (res.status === 409) { setMessage('That username is already taken.'); return; }
      if (!res.ok) throw new Error(resData.error || 'Failed');
      setMessage(data.username ? `Username set to @${resData.user.username}` : 'Display name updated');
      await refreshProfile();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading' || (loading && !settled) || (loading && ready)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (settled && !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-4 rounded-2xl border border-border bg-background-primary/80 p-6 text-center backdrop-blur-md">
          <h1 className="text-lg font-semibold text-text-primary">Couldn&apos;t open dashboard</h1>
          <p className="text-sm text-text-secondary">
            {bridgeError || 'Failed to connect your session to the API.'}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <AnimatedButton onClick={() => { setLoading(true); retryBridge(); }} className="px-4 py-2 text-sm">
              Try again
            </AnimatedButton>
            <button type="button" onClick={() => router.replace('/login')}
              className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent">
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <InteractiveBackground />
      <Navigation />
      <div className="flex flex-1">
        <Sidebar active={section} onSelect={setSection} pendingCount={pendingCount} />
        <main className="flex-1 max-w-3xl mx-auto px-4 py-8 space-y-6">
          {section === 'chats' && (
            <ChatsSection
              contacts={contacts}
              unreadCounts={unreadCounts}
              userId={userId!}
              busy={busy}
            />
          )}

          {section === 'requests' && (
            <RequestsSection
              incoming={incoming}
              outgoing={outgoing}
              userId={userId!}
              busy={busy}
              message={message}
              onRespond={respond}
              onSendRequest={sendRequest}
              onRefresh={fetchAll}
            />
          )}

          {section === 'profile' && (
            <ProfileSection
              profileUsername={profile?.username}
              profileDisplayName={profile?.displayName}
              busy={busy}
              message={message}
              onSave={saveProfile}
            />
          )}

          {section === 'security' && (
            <SecuritySection
              email={profile?.email}
              emailVerified={profile?.emailVerified}
              onVerify={handleVerify}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
