'use client';

import { useState } from 'react';
import { Search, Send, Check, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getApiBaseUrl } from '../../lib/api';
import {
  AnimatedButton,
  IconField,
  PageShell,
  listContainer,
  listItem,
} from '../../components/ui/motion';

const SERVER_URL = getApiBaseUrl();

export interface ChatReq {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  from?: { id: string; username?: string | null; displayName?: string | null; email?: string | null; };
  to?: { id: string; username?: string | null; displayName?: string | null; email?: string | null; };
}

export interface PublicUser {
  id: string;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
}

type ReqTab = 'incoming' | 'outgoing' | 'search';

interface Props {
  incoming: ChatReq[];
  outgoing: ChatReq[];
  userId: string;
  busy: boolean;
  message: string | null;
  onRespond: (requestId: string, status: 'accepted' | 'rejected') => void;
  onSendRequest: (toUserId: string) => void;
  onRefresh: () => void;
}

export default function RequestsSection({
  incoming,
  outgoing,
  userId,
  busy,
  message,
  onRespond,
  onSendRequest,
  onRefresh,
}: Props) {
  const [reqTab, setReqTab] = useState<ReqTab>('incoming');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);

  const searchUsers = async () => {
    if (query.trim().length < 2) return;
    try {
      const res = await fetch(`${SERVER_URL}/auth/user/${encodeURIComponent(query.trim())}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Not found');
      if (Array.isArray(data.users)) setResults(data.users);
      else if (data.id) setResults([data]);
      else setResults([]);
    } catch {
      setResults([]);
    }
  };

  return (
    <>
      <PageShell>
        <h1 className="text-2xl font-semibold text-text-primary">Requests</h1>
      </PageShell>

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
        {(['incoming', 'outgoing', 'search'] as ReqTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setReqTab(t)}
            className={`relative px-3 py-2 text-sm capitalize transition-colors ${
              reqTab === t ? 'text-accent' : 'text-text-secondary hover:text-accent'
            }`}
          >
            {t}
            {reqTab === t && (
              <motion.span
                layoutId="req-tab-underline"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {reqTab === 'search' && (
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
                  onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                  placeholder="Search username or email…"
                />
              </div>
              <AnimatedButton onClick={searchUsers} disabled={busy} className="px-4 py-2 text-sm">
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
                      onClick={() => {
                        onSendRequest(u.id);
                        setResults([]);
                        setQuery('');
                        setReqTab('outgoing');
                      }}
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

        {reqTab === 'incoming' && (
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
                      onClick={() => onRespond(r.id, 'accepted')}
                      disabled={busy}
                      className="p-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: busy ? 1 : 1.08 }}
                      whileTap={{ scale: busy ? 1 : 0.9 }}
                      onClick={() => onRespond(r.id, 'rejected')}
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

        {reqTab === 'outgoing' && (
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
    </>
  );
}
