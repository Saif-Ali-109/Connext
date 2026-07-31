'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { ArrowLeft, Check, CheckCheck, Loader2, Send, SmilePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useBridge } from '../../components/ClientProviders';
import { otherUserIdFromRoom } from '../../lib/roomId';
import { getApiBaseUrl } from '../../lib/api';
import { encryptMessage, decryptMessage, ensureKeys } from '../../lib/crypto';
import Navigation from '../../components/Navigation';
import { Spinner } from '../../components/ui/motion';
import EmojiPicker from '../../components/ui/EmojiPicker';

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
  reaction?: { emoji: string; mine: boolean } | null;
};

const MAX_MSG_LENGTH = 5000;

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
  const [peerPublicKey, setPeerPublicKey] = useState<string | null>(null);
  const ownPublicKeyRef = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const [composerPickerOpen, setComposerPickerOpen] = useState(false);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const readEmittedRef = useRef<Set<string>>(new Set());
  const messageIdsRef = useRef(new Set<string>());
  const lastProcessedCountRef = useRef(0);
  const tempIdCounter = useRef(0);

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
      const rows: ChatMessage[] = await Promise.all(
        (data.messages || [])
          .slice()
          .reverse()
          .map(
            async (m: {
              id: string;
              sender: string;
              text: string;
              encryptedContent?: string | null;
              encryptedContentForSender?: string | null;
              reaction?: string | null;
              reactedByUserId?: string | null;
              createdAt: string;
              deliveryState?: DeliveryState;
            }) => {
              let text = m.text;
              const ciphertext =
                m.sender === 'me'
                  ? m.encryptedContentForSender
                  : m.encryptedContent;
              if (ciphertext) {
                try {
                  text = await decryptMessage(ciphertext);
                } catch {
                  text = '[encrypted]';
                }
              }
              return {
                id: m.id,
                key: m.id,
                sender: m.sender === 'me' ? 'me' : ('other' as const),
                text,
                createdAt: m.createdAt,
                status: m.sender === 'me' ? m.deliveryState ?? 'sent' : undefined,
                reaction: m.reaction
                  ? { emoji: m.reaction, mine: m.reactedByUserId === userId }
                  : null,
              };
            }
          )
      );
      setMessages(rows);
      messageIdsRef.current = new Set(rows.map((r: ChatMessage) => r.id));
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
        setPeerPublicKey(data.publicKey ?? null);
      }
    } catch {
      // ignore
    }
  }, [otherUserId]);

  // Ensure current user has E2EE keys; generate + upload if missing
  useEffect(() => {
    ensureKeys(SERVER_URL).then((pk) => {
      ownPublicKeyRef.current = pk;
    });
  }, []);

  const applyReaction = useCallback(
    (messageId: string, emoji: string | null, reactedByUserId: string | null) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                reaction: emoji
                  ? { emoji, mine: reactedByUserId === userId }
                  : null,
              }
            : m
        )
      );
    },
    [userId]
  );

  const reactToMessage = useCallback(
    async (message: ChatMessage, emoji: string) => {
      if (!userId) return;
      try {
        const socket = socketRef.current;
        if (socket?.connected) {
          await new Promise<void>((resolve, reject) => {
            socket.emit(
              'react_message',
              { messageId: message.id, emoji },
              (ack?: {
                ok: boolean;
                error?: string;
                messageId?: string;
                emoji?: string | null;
                userId?: string | null;
              }) => {
                if (!ack?.ok) {
                  reject(new Error(ack?.error || 'Reaction failed'));
                  return;
                }
                if (ack.messageId) {
                  applyReaction(ack.messageId, ack.emoji ?? null, ack.userId ?? null);
                }
                resolve();
              }
            );
          });
        } else {
          const res = await fetch(`${SERVER_URL}/chat/react`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: message.id, emoji }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Reaction failed');
          applyReaction(data.messageId, data.emoji ?? null, data.userId ?? null);
        }
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : 'Failed to react');
      }
    },
    [userId, applyReaction]
  );

  const handleReactSelect = (message: ChatMessage, emoji: string) => {
    setReactingTo(null);
    void reactToMessage(message, emoji);
  };

  const insertEmojiAtCursor = (emoji: string) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? pos;
    const next = draft.slice(0, pos) + emoji + draft.slice(end);
    setDraft(next.slice(0, MAX_MSG_LENGTH));
    setComposerPickerOpen(false);
    requestAnimationFrame(() => {
      const caret = pos + emoji.length;
      el?.setSelectionRange(caret, caret);
      el?.focus();
    });
  };

  useEffect(() => {
    if (ready && userId) {
      void loadMessages();
      void loadPeer();
    }
  }, [ready, userId, loadMessages, loadPeer]);

  useEffect(() => {
    if (!ready || !userId || !otherUserId) return;

    let cancelled = false;
    socketRef.current?.disconnect();

    void (async () => {
      let token: string | undefined;
      try {
        const r = await fetch(`${SERVER_URL}/auth/token`, { credentials: 'include' });
        const d = await r.json();
        token = d.token;
      } catch { /* fall back to cookie */ }

      if (cancelled) return;

      const isRelative = SERVER_URL.startsWith('/');
      const socket = io(isRelative ? window.location.origin : SERVER_URL, {
        path: isRelative ? `${SERVER_URL}/socket.io` : undefined,
        auth: { token },
        withCredentials: true,
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join_room', { roomId, otherIdentifier: otherUserId });
      });

      const updateStatus = (messageId: string, newStatus: DeliveryState) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId && m.sender === 'me'
              ? { ...m, status: bumpStatus(m.status, newStatus) }
              : m
          )
        );
      };

      socket.on('receive_message', (payload: {
        id: string;
        sender?: { id: string };
        content?: string | null;
        encryptedContent?: string | null;
        encryptedContentForSender?: string | null;
        createdAt?: string;
        roomId?: string;
      }) => {
        if (payload.roomId && payload.roomId !== roomId) return;
        if (messageIdsRef.current.has(payload.id)) return;
        const mine = payload.sender?.id === userId;
        if (mine) return;
        messageIdsRef.current.add(payload.id);

        const ciphertext = payload.encryptedContent;
        const resolveText = ciphertext
          ? decryptMessage(ciphertext).catch(() => '[encrypted]')
          : Promise.resolve(payload.content || '');

        resolveText.then((text) => {
          setMessages((prev) => [
            ...prev,
            {
              id: payload.id,
              key: payload.id,
              sender: 'other',
              text,
              createdAt: payload.createdAt || new Date().toISOString(),
            },
          ]);
        });

        socket.emit('message_delivered', { roomId, messageId: payload.id });
        socket.emit('message_read', { roomId, messageId: payload.id });
      });

      socket.on('message_delivery_status', (data: { messageId: string; delivered: boolean }) => {
        updateStatus(data.messageId, data.delivered ? 'delivered' : 'sent');
      });

      socket.on('message_delivered_relay', (data: { messageId: string }) => {
        updateStatus(data.messageId, 'delivered');
      });

      socket.on('message_read_relay', (data: { messageId: string }) => {
        updateStatus(data.messageId, 'read');
      });

      socket.on(
        'message_reaction',
        (data: {
          messageId: string;
          emoji: string | null;
          userId: string | null;
          roomId?: string;
        }) => {
          if (data.roomId && data.roomId !== roomId) return;
          applyReaction(data.messageId, data.emoji ?? null, data.userId ?? null);
        }
      );
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [ready, userId, otherUserId, roomId, applyReaction]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || messages.length === 0) return;
    for (let i = lastProcessedCountRef.current; i < messages.length; i++) {
      const m = messages[i];
      if (m.sender === 'other' && !readEmittedRef.current.has(m.id)) {
        readEmittedRef.current.add(m.id);
        socket.emit('message_read', { roomId, messageId: m.id });
      }
    }
    lastProcessedCountRef.current = messages.length;
  }, [messages, roomId]);

  useEffect(() => {
    if (messages.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !userId || !otherUserId || sending) return;
    if (text.length > MAX_MSG_LENGTH) {
      alert(`Message too long (max ${MAX_MSG_LENGTH} characters)`);
      return;
    }
    setSending(true);
    setDraft('');

    const tempId = `local-${Date.now()}-${++tempIdCounter.current}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, key: tempId, sender: 'me', text, createdAt: new Date().toISOString(), status: 'sending' },
    ]);

    let encryptedContent: string | undefined;
    let encryptedContentForSender: string | undefined;
    if (peerPublicKey) {
      try {
        encryptedContent = await encryptMessage(peerPublicKey, text);
        if (ownPublicKeyRef.current) {
          encryptedContentForSender = await encryptMessage(ownPublicKeyRef.current, text);
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(text);
        alert('Encryption failed');
        setSending(false);
        return;
      }
    }

    try {
      const socket = socketRef.current;
      if (socket?.connected) {
        await new Promise<void>((resolve, reject) => {
          socket.emit(
            'send_message',
            {
              messageId: tempId,
              recipientUserId: otherUserId,
              content: encryptedContent ? undefined : text,
              encryptedContent,
              encryptedContentForSender,
            },
            (ack?: { ok: boolean; error?: string; messageId?: string; delivered?: boolean }) => {
              if (!ack?.ok) {
                reject(new Error(ack?.error || 'Send failed'));
                return;
              }
              const nextStatus: DeliveryState = ack.delivered ? 'delivered' : 'sent';
              if (ack.messageId) messageIdsRef.current.add(ack.messageId);
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
            content: encryptedContent ? undefined : text,
            encryptedContent,
            encryptedContentForSender,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Send failed');
        if (data.messageId) messageIdsRef.current.add(data.messageId);
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
              className={`group relative w-fit max-w-[80%] break-words rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
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

              {m.reaction && (
                <div
                  className={`mt-1 flex ${
                    m.sender === 'me' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <button
                    type="button"
                    title={m.reaction.mine ? 'Tap to remove reaction' : undefined}
                    onClick={() => {
                      if (m.reaction?.mine) void reactToMessage(m, m.reaction.emoji);
                    }}
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-base leading-none transition ${
                      m.sender === 'me'
                        ? 'border-white/30 bg-white/20 text-white'
                        : 'border-border bg-background-secondary text-text-primary'
                    } ${
                      m.reaction.mine
                        ? 'cursor-pointer hover:opacity-75'
                        : 'cursor-default'
                    }`}
                  >
                    {m.reaction.emoji}
                  </button>
                </div>
              )}

              {m.sender === 'other' && (
                <>
                  <button
                    type="button"
                    title="Add reaction"
                    onClick={() => {
                      setComposerPickerOpen(false);
                      setReactingTo(reactingTo === m.key ? null : m.key);
                    }}
                    className={`absolute bottom-1 left-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background-secondary text-text-secondary shadow-sm transition hover:text-accent ${
                      reactingTo === m.key
                        ? 'opacity-100 text-accent'
                        : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                    }`}
                  >
                    <SmilePlus className="h-3.5 w-3.5" />
                  </button>
                  {reactingTo === m.key && (
                    <div className="absolute bottom-full left-0 z-50 mb-2 w-[352px] max-w-[80vw] overflow-hidden rounded-2xl border border-border bg-background-secondary shadow-xl">
                      <EmojiPicker
                        onSelect={(emoji) => handleReactSelect(m, emoji)}
                      />
                    </div>
                  )}
                </>
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
        <div className="relative">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              setComposerPickerOpen((v) => !v);
              setReactingTo(null);
            }}
            title="Add emoji"
            className={`rounded-xl border border-border bg-input-bg p-2.5 text-text-secondary transition hover:text-accent ${
              composerPickerOpen ? 'text-accent' : ''
            }`}
          >
            <SmilePlus className="h-5 w-5" />
          </motion.button>
          {composerPickerOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-[352px] max-w-[80vw] overflow-hidden rounded-2xl border border-border bg-background-secondary shadow-xl">
              <EmojiPicker onSelect={insertEmojiAtCursor} />
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_MSG_LENGTH))}
          placeholder="Type a message…"
          maxLength={MAX_MSG_LENGTH}
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
