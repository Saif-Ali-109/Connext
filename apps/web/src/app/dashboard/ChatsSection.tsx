'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Search, Link2, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getRoomId } from '../../lib/roomId';
import { getApiBaseUrl } from '../../lib/api';
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

interface Props {
  contacts: Contact[];
  unreadCounts: Record<string, number>;
  userId: string;
  busy: boolean;
}

export default function ChatsSection({ contacts, unreadCounts, userId, busy }: Props) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const otherUser = (c: Contact) =>
    c.fromUserId === userId || c.from?.id === userId ? c.to : c.from;

  const openChat = (c: Contact) => {
    const other = otherUser(c);
    router.push(`/chat/${getRoomId(userId, other.id)}`);
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
      alert(e instanceof Error ? e.message : 'Failed to create invite');
    }
  };

  const filtered = useMemo(
    () => contacts.filter((c) => {
      const o = otherUser(c);
      const label = (c.fromCustomName || c.toCustomName || o?.displayName || o?.username || o?.email || '').toLowerCase();
      return label.includes(searchQuery.toLowerCase());
    }),
    [contacts, searchQuery]
  );

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
            const label = (c.fromUserId === userId ? c.fromCustomName : c.toCustomName) ||
              o?.displayName || o?.username || o?.email || o?.id;
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
    </>
  );
}
