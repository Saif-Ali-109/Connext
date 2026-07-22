'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Users, MessageSquare, Search, Link2, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Navigation from '../../components/Navigation';
import InteractiveBackground from '../../components/ui/InteractiveBackground';
import { useSession } from 'next-auth/react';
import { useBridge } from '../../components/ClientProviders';
import { getRoomId } from '../../lib/roomId';
import { getApiBaseUrl } from '../../lib/api';
import {
  AnimatedButton,
  IconField,
  PageShell,
  Spinner,
  listContainer,
  listItem,
} from '../../components/ui/motion';

const SERVER_URL = getApiBaseUrl();

interface ContactUser {
  id: string;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
}

interface Contact {
  id: string;
  from: ContactUser;
  to: ContactUser;
  fromUserId: string;
  toUserId: string;
  status: string;
  fromCustomName?: string;
  toCustomName?: string;
}

function DashboardContent() {
  const router = useRouter();
  const { status } = useSession();
  const { ready, settled, error: bridgeError, userId, retryBridge } = useBridge();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const fetchContacts = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${SERVER_URL}/chat/requests`, { credentials: 'include' });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  const fetchUnreadCounts = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${SERVER_URL}/chat/unreadCounts?userId=${userId}`, {
        credentials: 'include',
      });
      if (res.ok) setUnreadCounts(await res.json());
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    if (ready && userId) {
      void fetchContacts();
      void fetchUnreadCounts();
    } else if (settled && !ready) {
      // Bridge failed — stop spinning so the error state can render.
      setLoading(false);
    }
  }, [ready, settled, userId, fetchContacts, fetchUnreadCounts]);

  // Refresh unread counts when returning to the tab (e.g. after reading a chat).
  useEffect(() => {
    const onFocus = () => {
      if (ready && userId) void fetchUnreadCounts();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [ready, userId, fetchUnreadCounts]);

  const otherUser = (c: Contact) =>
    c.fromUserId === userId || c.from?.id === userId ? c.to : c.from;

  const openChat = (c: Contact) => {
    if (!userId) return;
    const other = otherUser(c);
    const roomId = getRoomId(userId, other.id);
    router.push(`/chat/${roomId}`);
  };

  const createInvite = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${SERVER_URL}/chat/invite`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const url = `${window.location.origin}/invite?token=${data.invite.token}`;
      setInviteUrl(url);
      await navigator.clipboard.writeText(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create invite');
    } finally {
      setBusy(false);
    }
  };

  const filtered = contacts.filter((c) => {
    const o = otherUser(c);
    const label = (c.fromCustomName || c.toCustomName || o?.displayName || o?.username || o?.email || '').toLowerCase();
    return label.includes(searchQuery.toLowerCase());
  });

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
            <AnimatedButton
              onClick={() => {
                setLoading(true);
                retryBridge();
              }}
              className="px-4 py-2 text-sm"
            >
              Try again
            </AnimatedButton>
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <InteractiveBackground />
      <Navigation />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <PageShell className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Chats</h1>
            <p className="text-sm text-text-secondary">Message people by username or invite link.</p>
          </div>
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: busy ? 1 : 1.03 }}
              whileTap={{ scale: busy ? 1 : 0.97 }}
              onClick={createInvite}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:opacity-60"
            >
              <Link2 className="w-4 h-4" />
              Invite link
            </motion.button>
            <AnimatedButton onClick={() => router.push('/requests')} className="px-3 py-2 text-sm">
              <Users className="w-4 h-4" />
              Find people
            </AnimatedButton>
          </div>
        </PageShell>

        <AnimatePresence>
          {inviteUrl && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs break-all text-text-secondary">
                <Check className="w-4 h-4 shrink-0 text-accent" />
                <span>Copied invite link: {inviteUrl}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <IconField
          icon={<Search className="w-4 h-4" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter contacts…"
        />

        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="text-center py-16 text-text-secondary space-y-2"
          >
            <MessageSquare className="w-10 h-10 mx-auto opacity-40" />
            <p>No chats yet. Search for a username or share an invite link.</p>
          </motion.div>
        ) : (
          <motion.ul
            variants={listContainer}
            initial="hidden"
            animate="show"
            className="divide-y divide-border rounded-xl border border-border overflow-hidden bg-background-primary/60 backdrop-blur-md"
          >
            {filtered.map((c) => {
              const o = otherUser(c);
              const label =
                (c.fromUserId === userId ? c.fromCustomName : c.toCustomName) ||
                o?.displayName ||
                o?.username ||
                o?.email ||
                o?.id;
              const unread = unreadCounts[o?.id] || 0;
              return (
                <motion.li key={c.id} variants={listItem}>
                  <motion.button
                    whileHover={{ x: 4 }}
                    onClick={() => openChat(c)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-background-secondary text-left"
                  >
                    <div>
                      <div className="font-medium text-text-primary">{label}</div>
                      <div className="text-xs text-text-muted">@{o?.username || 'user'}</div>
                    </div>
                    {unread > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                        className="rounded-full bg-accent text-white text-xs px-2 py-0.5"
                      >
                        {unread}
                      </motion.span>
                    )}
                  </motion.button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </main>
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
