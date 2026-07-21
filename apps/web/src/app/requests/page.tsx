'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Check, X, Send } from 'lucide-react';
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

type Tab = 'incoming' | 'outgoing' | 'search';

interface PublicUser {
  id: string;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
}

interface ChatReq {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  from?: PublicUser;
  to?: PublicUser;
}

function RequestsContent() {
  const router = useRouter();
  const { status } = useSession();
  const { ready, userId, profile, refreshProfile } = useBridge();
  const [tab, setTab] = useState<Tab>('incoming');
  const [incoming, setIncoming] = useState<ChatReq[]>([]);
  const [outgoing, setOutgoing] = useState<ChatReq[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (profile?.username) setUsername(profile.username);
  }, [profile?.username]);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/chat/requests`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && userId) void load();
  }, [ready, userId]);

  const respond = async (requestId: string, nextStatus: 'accepted' | 'rejected') => {
    setBusy(true);
    try {
      const res = await fetch(`${SERVER_URL}/chat/respond`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${SERVER_URL}/auth/user/${encodeURIComponent(query.trim())}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Not found');
      if (Array.isArray(data.users)) setResults(data.users);
      else if (data.id) setResults([data]);
      else setResults([]);
    } catch (e) {
      setResults([]);
      setMessage(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async (toUserId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${SERVER_URL}/chat/request`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessage('Request sent');
      await load();
      setTab('outgoing');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const saveUsername = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${SERVER_URL}/auth/username`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setMessage('That username is already taken. Try another.');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessage(`Username set to @${data.user.username}`);
      await refreshProfile();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const openChat = (req: ChatReq) => {
    if (!userId) return;
    const otherId = req.fromUserId === userId ? req.toUserId : req.fromUserId;
    router.push(`/chat/${getRoomId(userId, otherId)}`);
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <InteractiveBackground />
      <Navigation />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <PageShell>
          <h1 className="text-2xl font-semibold text-text-primary">People</h1>
        </PageShell>

        <div className="rounded-xl border border-border p-4 space-y-3 bg-background-primary/60 backdrop-blur-md">
          <p className="text-sm text-text-secondary">
            {profile?.username ? (
              <>
                Your username is <span className="font-medium text-text-primary">@{profile.username}</span>. Change it below.
              </>
            ) : (
              'Set a username so others can find you'
            )}
          </p>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              className="flex-1 rounded-lg border border-border bg-background-secondary px-3 py-2 text-sm"
            />
            <AnimatedButton
              onClick={saveUsername}
              disabled={busy || username.trim().toLowerCase() === (profile?.username ?? '') || username.length < 3}
              className="px-4 py-2 text-sm"
            >
              {profile?.username ? 'Update' : 'Save'}
            </AnimatedButton>
          </div>
        </div>

        <AnimatePresence>
          {message && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="text-sm text-accent"
            >
              {message}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex gap-1 border-b border-border">
          {(['incoming', 'outgoing', 'search'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-3 py-2 text-sm capitalize transition-colors ${
                tab === t ? 'text-accent' : 'text-text-secondary hover:text-accent'
              }`}
            >
              {t}
              {tab === t && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="flex gap-2">
                <div className="flex-1">
                  <IconField
                    icon={<Search className="w-4 h-4" />}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && search()}
                    placeholder="Search username or email…"
                  />
                </div>
                <AnimatedButton onClick={search} disabled={busy} className="px-4 py-2 text-sm">
                  <Search className="w-4 h-4" />
                  Search
                </AnimatedButton>
              </div>
              <motion.ul variants={listContainer} initial="hidden" animate="show" className="space-y-2">
                <AnimatePresence>
                  {results.map((u) => (
                    <motion.li
                      key={u.id}
                      variants={listItem}
                      layout
                      exit="exit"
                      className="flex items-center justify-between rounded-xl border border-border px-3 py-2 bg-background-primary/60 backdrop-blur-md"
                    >
                      <div>
                        <div className="font-medium text-text-primary">{u.displayName || u.username || u.email}</div>
                        <div className="text-xs text-text-muted">@{u.username || '—'}</div>
                      </div>
                      <motion.button
                        whileHover={{ scale: busy || u.id === userId ? 1 : 1.05 }}
                        whileTap={{ scale: busy || u.id === userId ? 1 : 0.95 }}
                        onClick={() => sendRequest(u.id)}
                        disabled={busy || u.id === userId}
                        className="inline-flex items-center gap-1 rounded-lg bg-accent text-white px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Request
                      </motion.button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            </motion.div>
          )}

          {tab === 'incoming' && (
            <motion.ul
              key="incoming"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              {incoming.length === 0 && (
                <p className="text-sm text-text-secondary">No incoming requests</p>
              )}
              <AnimatePresence>
                {incoming.map((r) => (
                  <motion.li
                    key={r.id}
                    variants={listItem}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    layout
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2 bg-background-primary/60 backdrop-blur-md"
                  >
                    <div>
                      <div className="font-medium text-text-primary">
                        {r.from?.displayName || r.from?.username || r.fromUserId}
                      </div>
                      <div className="text-xs text-text-muted">@{r.from?.username || 'user'}</div>
                    </div>
                    <div className="flex gap-2">
                      <motion.button
                        whileHover={{ scale: busy ? 1 : 1.08 }}
                        whileTap={{ scale: busy ? 1 : 0.9 }}
                        onClick={() => respond(r.id, 'accepted')}
                        disabled={busy}
                        className="p-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: busy ? 1 : 1.08 }}
                        whileTap={{ scale: busy ? 1 : 0.9 }}
                        onClick={() => respond(r.id, 'rejected')}
                        disabled={busy}
                        className="p-2 rounded-lg bg-red-600 text-white disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}

          {tab === 'outgoing' && (
            <motion.ul
              key="outgoing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              {outgoing.length === 0 && (
                <p className="text-sm text-text-secondary">No outgoing requests</p>
              )}
              <AnimatePresence>
                {outgoing.map((r) => (
                  <motion.li
                    key={r.id}
                    variants={listItem}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    layout
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2 bg-background-primary/60 backdrop-blur-md"
                  >
                    <div>
                      <div className="font-medium text-text-primary">
                        {r.to?.displayName || r.to?.username || r.toUserId}
                      </div>
                      <div className="text-xs text-text-muted">pending</div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <RequestsContent />
    </Suspense>
  );
}
