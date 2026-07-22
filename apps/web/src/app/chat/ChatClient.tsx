'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { ArrowLeft, Check, CheckCheck, Loader2, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useBridge } from '../../components/ClientProviders';
import { otherUserIdFromRoom } from '../../lib/roomId';
import { getApiBaseUrl } from '../../lib/api';
import Navigation from '../../components/Navigation';
import { Spinner } from '../../components/ui/motion';

const SERVER_URL = getApiBaseUrl();

type DeliveryState = 'sending' | 'sent' | 'delivered' | 'read';

const STATUS_RANK: Record<DeliveryState, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/** Only advance a message's status forward, never downgrade it. */
function bumpStatus(current: DeliveryState | undefined, next: DeliveryState): DeliveryState {
  if (!current) return next;
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current;
}

function StatusTick({ status }: { status?: DeliveryState }) {
  if (!status) return null;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={status}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.6 }}
        transition={{ duration: 0.15 }}
        className="inline-flex"
      >
        {status === 'sending' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin opacity-70" aria-label="Sending" />
        ) : status === 'sent' ? (
          <Check className="w-3.5 h-3.5 opacity-70" aria-label="Sent" />
        ) : (
          // delivered and read both show the double check; read tints it.
          <CheckCheck
            className={`w-3.5 h-3.5 ${status === 'read' ? 'text-sky-300' : 'opacity-70'}`}
            aria-label={status === 'read' ? 'Read' : 'Delivered'}
          />
        )}
      </motion.span>
    </AnimatePresence>
  );
}

type ChatMessage = {
  id: string;
  // Stable React/animation key. Unlike `id` (which swaps from a temp `local-…`
  // value to the server id on send-ack), this never changes, so the bubble
  // animates in once and doesn't remount/re-animate when the id updates.
  key: string;
  sender: 'me' | 'other';
  text: string;
  createdAt: string;
  status?: DeliveryState;
};

export default function ChatClient() {
  const params = useParams();
  const router = useRouter();
  const roomId = String(params.roomId || '');
  const { status } = useSession();
  const { ready, userId } = useBridge();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [peerLabel, setPeerLabel] = useState('Chat');
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const readEmittedRef = useRef<Set<string>>(new Set());

  const otherUserId = userId ? otherUserIdFromRoom(roomId, userId) : null;

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const loadMessages = useCallback(async () => {
    if (!userId || !roomId) return;
    try {
      const res = await fetch(
        `${SERVER_URL}/chat/messages/${encodeURIComponent(roomId)}?currentUserId=${userId}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load messages');
      const rows: ChatMessage[] = (data.messages || [])
        .slice()
        .reverse()
        .map(
          (m: {
            id: string;
            sender: string;
            text: string;
            createdAt: string;
            deliveryState?: DeliveryState;
          }) => ({
            id: m.id,
            key: m.id,
            sender: m.sender === 'me' ? 'me' : ('other' as const),
            text: m.text,
            createdAt: m.createdAt,
            status: m.sender === 'me' ? m.deliveryState ?? 'sent' : undefined,
          })
        );
      setMessages(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId, roomId]);

  const loadPeer = useCallback(async () => {
    if (!otherUserId) return;
    try {
      const res = await fetch(`${SERVER_URL}/auth/user/${otherUserId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setPeerLabel(data.displayName || data.username || data.email || 'Chat');
      }
    } catch {
      // ignore
    }
  }, [otherUserId]);

  useEffect(() => {
    if (ready && userId) {
      void loadMessages();
      void loadPeer();
    }
  }, [ready, userId, loadMessages, loadPeer]);

  useEffect(() => {
    if (!ready || !userId || !otherUserId) return;

    const isRelative = SERVER_URL.startsWith('/');
    const socket = io(isRelative ? window.location.origin : SERVER_URL, {
      path: isRelative ? `${SERVER_URL}/socket.io` : undefined,
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { roomId, otherIdentifier: otherUserId });
    });

    socket.on('receive_message', (payload: {
      id: string;
      sender?: { id: string };
      content?: string;
      encryptedContent?: string;
      createdAt?: string;
      roomId?: string;
    }) => {
      if (payload.roomId && payload.roomId !== roomId) return;
      const text = payload.content || payload.encryptedContent || '';
      const mine = payload.sender?.id === userId;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [
          ...prev,
          {
            id: payload.id,
            key: payload.id,
            sender: mine ? 'me' : 'other',
            text,
            createdAt: payload.createdAt || new Date().toISOString(),
            status: mine ? 'sent' : undefined,
          },
        ];
      });
      // Incoming message from the peer: acknowledge receipt, and since this
      // chat is open on screen, mark it read immediately.
      if (!mine) {
        socket.emit('message_delivered', { roomId, messageId: payload.id });
        socket.emit('message_read', { roomId, messageId: payload.id });
      }
    });

    // Sender-side updates: the peer's device acknowledged/opened our message.
    socket.on('message_delivery_status', (data: { messageId: string; delivered: boolean }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId && m.sender === 'me'
            ? { ...m, status: bumpStatus(m.status, data.delivered ? 'delivered' : 'sent') }
            : m
        )
      );
    });

    socket.on('message_delivered_relay', (data: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId && m.sender === 'me'
            ? { ...m, status: bumpStatus(m.status, 'delivered') }
            : m
        )
      );
    });

    socket.on('message_read_relay', (data: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId && m.sender === 'me'
            ? { ...m, status: 'read' }
            : m
        )
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [ready, userId, otherUserId, roomId]);

  // Opening the chat marks the peer's already-received messages as read.
  // The load endpoint flips the DB flag; this notifies the sender live so
  // their ticks turn blue without a reload.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || messages.length === 0) return;
    for (const m of messages) {
      if (m.sender === 'other' && !readEmittedRef.current.has(m.id)) {
        readEmittedRef.current.add(m.id);
        socket.emit('message_read', { roomId, messageId: m.id });
      }
    }
  }, [messages, roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !userId || !otherUserId || sending) return;
    setSending(true);
    setDraft('');

    const tempId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, key: tempId, sender: 'me', text, createdAt: new Date().toISOString(), status: 'sending' },
    ]);

    try {
      const socket = socketRef.current;
      if (socket?.connected) {
        await new Promise<void>((resolve, reject) => {
          socket.emit(
            'send_message',
            {
              messageId: tempId,
              recipientUserId: otherUserId,
              content: text,
            },
            (ack?: { ok: boolean; error?: string; messageId?: string; delivered?: boolean }) => {
              if (!ack?.ok) {
                reject(new Error(ack?.error || 'Send failed'));
                return;
              }
              const nextStatus: DeliveryState = ack.delivered ? 'delivered' : 'sent';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempId
                    ? { ...m, id: ack.messageId ?? m.id, status: nextStatus }
                    : m
                )
              );
              resolve();
            }
          );
        });
      } else {
        const res = await fetch(`${SERVER_URL}/chat/send-message`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderId: userId,
            recipientUserId: otherUserId,
            content: text,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Send failed');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, id: data.messageId ?? m.id, status: 'sent' } : m
          )
        );
      }
    } catch (e) {
      console.error(e);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      alert(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background-primary">
      <Navigation />
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <motion.button
          whileHover={{ x: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => router.push('/dashboard')}
          className="p-1 rounded-lg text-text-secondary hover:text-accent"
        >
          <ArrowLeft className="w-5 h-5" />
        </motion.button>
        <div>
          <div className="font-medium text-text-primary">{peerLabel}</div>
          <div className="text-xs text-text-muted truncate max-w-xs">{roomId}</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.key}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              className={`w-fit max-w-[80%] break-words rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.sender === 'me'
                  ? 'ml-auto bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-900/20'
                  : 'mr-auto bg-background-secondary text-text-primary border border-border'
              }`}
            >
              {m.text}
              {m.sender === 'me' && (
                <span className="mt-0.5 flex items-center justify-end gap-1">
                  <StatusTick status={m.status} />
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-border p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-xl border border-border bg-input-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <motion.button
          type="submit"
          whileHover={{ scale: sending || !draft.trim() ? 1 : 1.05 }}
          whileTap={{ scale: sending || !draft.trim() ? 1 : 0.92 }}
          disabled={sending || !draft.trim()}
          className="rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white px-4 py-2 shadow-lg shadow-violet-900/25 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </motion.button>
      </form>
    </div>
  );
}
