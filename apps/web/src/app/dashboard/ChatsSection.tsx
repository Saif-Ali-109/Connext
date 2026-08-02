'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, MoreVertical, Search as SearchIcon, Link2, Check, FileText, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { getRoomId } from '../../lib/roomId';
import { getApiBaseUrl } from '../../lib/api';
import { useToast } from '../../components/ui/Toast';
import {
  IconField,
  PageShell,
  listContainer,
  listItem,
} from '../../components/ui/motion';

const SERVER_URL = getApiBaseUrl();

export interface Contact {
  id: string;
  from: { id: string; username?: string | null; displayName?: string | null; email?: string | null; };
  to: { id: string; username?: string | null; displayName?: string | null; email?: string | null; };
  fromUserId: string;
  toUserId: string;
  status: string;
  fromCustomName?: string;
  toCustomName?: string;
}

interface SearchResult {
  messageId: string;
  roomId: string;
  snippet: string;
  isEncrypted: boolean;
  sender: { id: string; username?: string | null; displayName?: string | null } | null;
  createdAt: string;
}

interface Props {
  contacts: Contact[];
  unreadCounts: Record<string, number>;
  userId: string;
  busy: boolean;
  onRefresh: () => void;
}

function otherUserOf(c: Contact, userId: string) {
  return c.fromUserId === userId || c.from?.id === userId ? c.to : c.from;
}

function contactLabel(c: Contact, userId: string) {
  const o = otherUserOf(c, userId);
  return (
    (c.fromUserId === userId ? c.fromCustomName : c.toCustomName) ||
    o?.displayName ||
    o?.username ||
    o?.email ||
    o?.id
  );
}

function ContactRow({
  contact,
  userId,
  online,
  unread,
  onOpen,
  onRefresh,
}: {
  contact: Contact;
  userId: string;
  online: boolean;
  unread: number;
  onOpen: (c: Contact) => void;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [working, setWorking] = useState(false);

  const other = otherUserOf(contact, userId);
  const label = contactLabel(contact, userId);

  const startRename = () => {
    setRenameValue(label);
    setMenuOpen(false);
    setRenaming(true);
  };

  const saveRename = async () => {
    if (!other) return;
    setWorking(true);
    try {
      const res = await fetch(`${SERVER_URL}/chat/contact-name`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactUserId: other.id, customName: renameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to rename contact');
      setRenaming(false);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename contact');
    } finally {
      setWorking(false);
    }
  };

  const removeContact = async () => {
    if (!other) return;
    setWorking(true);
    try {
      const res = await fetch(`${SERVER_URL}/chat/disconnect`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactUserId: other.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect');
      setConfirmingRemove(false);
      setMenuOpen(false);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to disconnect');
    } finally {
      setWorking(false);
    }
  };

  if (renaming) {
    return (
      <motion.li variants={listItem} className="flex items-center gap-2 px-4 py-3">
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveRename();
            if (e.key === 'Escape') setRenaming(false);
          }}
          className="flex-1 rounded-lg border border-input-border bg-input-bg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
          placeholder="Contact name"
        />
        <motion.button
          type="button"
          whileTap={{ scale: working ? 1 : 0.9 }}
          onClick={() => void saveRename()}
          disabled={working}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Save
        </motion.button>
        <button
          type="button"
          onClick={() => setRenaming(false)}
          aria-label="Cancel rename"
          className="rounded-lg p-1.5 text-text-secondary transition hover:text-accent"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.li>
    );
  }

  if (confirmingRemove) {
    return (
      <motion.li variants={listItem} className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm text-text-primary truncate">Remove {label}?</span>
        <div className="flex shrink-0 gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: working ? 1 : 0.9 }}
            onClick={() => void removeContact()}
            disabled={working}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Remove
          </motion.button>
          <button
            type="button"
            onClick={() => setConfirmingRemove(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition hover:text-accent"
          >
            Cancel
          </button>
        </div>
      </motion.li>
    );
  }

  return (
    <motion.li variants={listItem} className="relative">
      <div className="flex items-center px-4 py-3 hover:bg-background-secondary">
        <motion.button
          whileHover={{ x: 4 }}
          onClick={() => onOpen(contact)}
          className="flex-1 flex items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                  online ? 'bg-emerald-400' : 'bg-text-muted'
                }`}
                title={online ? 'Online' : 'Offline'}
              />
              <span className="font-medium text-text-primary truncate">{label}</span>
            </div>
            <div className="text-xs text-text-muted">@{other?.username || 'user'}</div>
          </div>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className="rounded-full bg-accent text-white dark:text-indigo-950 text-xs px-2 py-0.5"
            >
              {unread}
            </motion.span>
          )}
        </motion.button>
        <div className="relative ml-2 shrink-0">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label="Contact options"
            className="rounded-lg p-1.5 text-text-secondary transition hover:text-accent"
          >
            <MoreVertical className="w-4 h-4" />
          </motion.button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-background-secondary shadow-xl"
              >
                <button
                  type="button"
                  onClick={startRename}
                  className="w-full px-3 py-2 text-left text-sm text-text-primary transition hover:bg-background-primary"
                >
                  Rename contact
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingRemove(true);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 transition hover:bg-background-primary"
                >
                  Remove contact
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.li>
  );
}

export default function ChatsSection({ contacts, unreadCounts, userId, busy, onRefresh }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openChat = (c: Contact) => {
    const other = otherUserOf(c, userId);
    router.push(`/chat/${getRoomId(userId, other.id)}`);
  };

  const openSearchResult = (r: SearchResult) => {
    router.push(`/chat/${r.roomId}`);
  };

  const createInvite = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/chat/invite`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const url = `${window.location.origin}/invite?token=${data.invite.token}`;
      setInviteUrl(url);
      await navigator.clipboard.writeText(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create invite');
    }
  };

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;
    void (async () => {
      let token: string | undefined;
      try {
        const r = await fetch(`${SERVER_URL}/auth/token`, { credentials: 'include' });
        const d = await r.json();
        token = d.token;
      } catch {
        // fall back to cookie auth
      }
      if (cancelled) return;
      const isRelative = SERVER_URL.startsWith('/');
      socket = io(isRelative ? window.location.origin : SERVER_URL, {
        path: isRelative ? `${SERVER_URL}/socket.io` : undefined,
        auth: { token },
        withCredentials: true,
        transports: ['websocket', 'polling'],
      });
      socket.on('user_online', (data: { userId?: string }) => {
        const id = data.userId;
        if (!id) return;
        setOnlineIds((prev) => new Set(prev).add(id));
      });
      socket.on('user_offline', (data: { userId?: string }) => {
        const id = data.userId;
        if (!id) return;
        setOnlineIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    })();
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, []);

  const contactIds = useMemo(
    () => contacts.map((c) => otherUserOf(c, userId)?.id).filter(Boolean) as string[],
    [contacts, userId]
  );

  useEffect(() => {
    if (contactIds.length === 0) return;
    let cancelled = false;
    void Promise.all(
      contactIds.map(async (id) => {
        try {
          const res = await fetch(
            `${SERVER_URL}/chat/online-status/${encodeURIComponent(id)}`,
            { credentials: 'include' }
          );
          const d = await res.json();
          if (!cancelled && d.online) setOnlineIds((prev) => new Set(prev).add(id));
        } catch {
          // silent
        }
      })
    );
    return () => {
      cancelled = true;
    };
  }, [contactIds]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${SERVER_URL}/chat/search?q=${encodeURIComponent(q)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results ?? []);
        }
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const filtered = useMemo(
    () => contacts.filter((c) => {
      const o = otherUserOf(c, userId);
      const label = (c.fromCustomName || c.toCustomName || o?.displayName || o?.username || o?.email || '').toLowerCase();
      return label.includes(searchQuery.toLowerCase());
    }),
    [contacts, searchQuery, userId]
  );

  const showResults = searchResults !== null && searchQuery.trim().length >= 2;

  return (
    <>
      <PageShell className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Chats</h1>
          <p className="text-sm text-text-secondary">Message people by username or invite link.</p>
        </div>
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
        icon={<SearchIcon className="w-4 h-4" />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search contacts or messages…"
      />

      {showResults ? (
        <div className="space-y-3">
          {searching && (
            <p className="text-xs text-text-muted animate-pulse">Searching messages…</p>
          )}

          {searchResults.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                Messages
              </p>
              <motion.ul
                variants={listContainer}
                initial="hidden"
                animate="show"
                className="divide-y divide-border rounded-xl border border-border overflow-hidden bg-background-primary/60 backdrop-blur-md"
              >
                {searchResults.map((r) => (
                  <motion.li key={r.messageId} variants={listItem}>
                    <motion.button
                      whileHover={{ x: 4 }}
                      onClick={() => openSearchResult(r)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-background-secondary text-left"
                    >
                      <FileText className="w-4 h-4 shrink-0 text-text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-text-muted">
                          @{r.sender?.username || 'unknown'}
                        </div>
                        <div className="text-sm text-text-primary truncate">
                          {r.isEncrypted ? '[encrypted message]' : r.snippet}
                        </div>
                      </div>
                    </motion.button>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Contacts
            </p>
            {filtered.length === 0 ? (
              <p className="text-sm text-text-secondary py-4 text-center">No matching contacts</p>
            ) : (
              <motion.ul
                variants={listContainer}
                initial="hidden"
                animate="show"
                className="divide-y divide-border rounded-xl border border-border overflow-hidden bg-background-primary/60 backdrop-blur-md"
              >
                {filtered.map((c) => {
                  const o = otherUserOf(c, userId);
                  const unread = unreadCounts[o?.id || ''] || 0;
                  return (
                    <ContactRow
                      key={c.id}
                      contact={c}
                      userId={userId}
                      online={onlineIds.has(o?.id || '')}
                      unread={unread}
                      onOpen={openChat}
                      onRefresh={onRefresh}
                    />
                  );
                })}
              </motion.ul>
            )}
          </div>
        </div>
      ) : (
        <>
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
                const o = otherUserOf(c, userId);
                const unread = unreadCounts[o?.id || ''] || 0;
                return (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    userId={userId}
                    online={onlineIds.has(o?.id || '')}
                    unread={unread}
                    onOpen={openChat}
                    onRefresh={onRefresh}
                  />
                );
              })}
            </motion.ul>
          )}
        </>
      )}
    </>
  );
}
