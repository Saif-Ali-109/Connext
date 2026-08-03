'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { ArrowLeft, Check, CheckCheck, Loader2, Lock, Paperclip, Send, ShieldAlert, SmilePlus, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useBridge } from '../../components/ClientProviders';
import { otherUserIdFromRoom } from '../../lib/roomId';
import { getApiBaseUrl } from '../../lib/api';
import {
  decryptMessage,
  encryptMessage,
  getStoredPublicKey,
  syncKeyWithServer,
  uploadKeyWithProof,
} from '../../lib/crypto';
import { uploadMedia, type FileAttachment } from '../../lib/media';
import MediaMessage from '../../components/chat/MediaMessage';
import Navigation from '../../components/Navigation';
import { Spinner, AnimatedButton } from '../../components/ui/motion';
import EmojiPicker from '../../components/ui/EmojiPicker';
import { useToast } from '../../components/ui/Toast';

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

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDay) / 86400000);
  if (daysAgo === 0) return time;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) dateOptions.year = 'numeric';
  return `${date.toLocaleDateString([], dateOptions)}, ${time}`;
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
  attachment?: FileAttachment | null;
  decryptionFailed?: boolean;
};

const MAX_MSG_LENGTH = 5000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const TYPING_STOP_MS = 2000;
const TYPING_TIMEOUT_MS = 4000;
const PEER_KEY_TTL_MS = 15_000;

function parseAttachment(text: string): FileAttachment | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.type === 'file' && typeof parsed.objectKey === 'string') {
      return {
        type: 'file',
        fileType: typeof parsed.fileType === 'string' ? parsed.fileType : '',
        fileName: typeof parsed.fileName === 'string' ? parsed.fileName : 'File',
        objectKey: parsed.objectKey,
        size: typeof parsed.size === 'number' ? parsed.size : undefined,
      };
    }
  } catch {
    // not an attachment payload
  }
  return null;
}
const PAGE_SIZE = 20;

export default function ChatClient() {
  const params = useParams();
  const router = useRouter();
  const roomId = String(params.roomId || '');
  const { status } = useSession();
  const { ready, settled, error: bridgeError, userId, retryBridge } = useBridge();
  const toast = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [peerLabel, setPeerLabel] = useState('Chat');
  const [peerPublicKey, setPeerPublicKey] = useState<string | null>(null);
  const peerPublicKeyRef = useRef<string | null>(null);
  const peerKeyCacheRef = useRef<{ key: string | null; fetchedAt: number }>({ key: null, fetchedAt: 0 });
  const [keyStatus, setKeyStatus] = useState<'checking' | 'ok' | 'mismatch' | 'unavailable'>('checking');
  const [serverFingerprint, setServerFingerprint] = useState<string | null>(null);
  const ownPublicKeyRef = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const [composerPickerOpen, setComposerPickerOpen] = useState(false);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [uploading, setUploading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readEmittedRef = useRef<Set<string>>(new Set());
  const messageIdsRef = useRef(new Set<string>());
  const lastProcessedCountRef = useRef(0);
  const tempIdCounter = useRef(0);
  const typingSentRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pageRef = useRef(1);
  const prevListRef = useRef<{ count: number; oldestId: string | null }>({ count: 0, oldestId: null });

  const otherUserId = userId ? otherUserIdFromRoom(roomId, userId) : null;
  const hasUndecryptableMessages = messages.some((m) => m.decryptionFailed);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const loadMessages = useCallback(
    async (page = 1, prepend = false) => {
      if (!userId || !roomId) return;
      try {
        const res = await fetch(
          `${SERVER_URL}/chat/messages/${encodeURIComponent(roomId)}?currentUserId=${userId}&page=${page}&limit=${PAGE_SIZE}`,
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
                let decryptionFailed = false;
                const ciphertext =
                  m.sender === 'me'
                    ? m.encryptedContentForSender
                    : m.encryptedContent;
                if (ciphertext) {
                  try {
                    text = await decryptMessage(ciphertext);
                  } catch {
                    text = '';
                    decryptionFailed = true;
                  }
                }
              return {
                id: m.id,
                key: m.id,
                sender: m.sender === 'me' ? 'me' : ('other' as const),
                text,
                decryptionFailed,
                createdAt: m.createdAt,
                status: m.sender === 'me' ? m.deliveryState ?? 'sent' : undefined,
                reaction: m.reaction
                  ? { emoji: m.reaction, mine: m.reactedByUserId === userId }
                  : null,
                attachment: decryptionFailed ? null : parseAttachment(text),
              };
              }
            )
        );
        setHasMore(Boolean(data.hasMore));
        pageRef.current = page;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const fresh = rows.filter((r) => !existingIds.has(r.id));
          for (const r of fresh) messageIdsRef.current.add(r.id);
          return prepend ? [...fresh, ...prev] : [...prev, ...fresh];
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
        setLoadingOlder(false);
      }
    },
    [userId, roomId]
  );

  const loadOlder = useCallback(() => {
    if (loadingOlder) return;
    setLoadingOlder(true);
    void loadMessages(pageRef.current + 1, true);
  }, [loadingOlder, loadMessages]);

  const loadPeer = useCallback(async (): Promise<string | null> => {
    if (!otherUserId) return null;
    try {
      const res = await fetch(`${SERVER_URL}/auth/user/${otherUserId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setPeerLabel(data.displayName || data.username || data.email || 'Chat');
        const key = data.publicKey ?? null;
        peerPublicKeyRef.current = key;
        setPeerPublicKey(key);
        peerKeyCacheRef.current = { key, fetchedAt: Date.now() };
        return key;
      }
    } catch {
      // ignore
    }
    return peerKeyCacheRef.current.key;
  }, [otherUserId]);

  // Return the recipient's current public key, refetching from the server when
  // the cached copy is stale. `/auth/user/:id` is rate-limited (30/min), so we
  // reuse a recent fetch; the `key_updated` socket event forces an instant
  // refetch after a rotation, keeping the staleness window tiny.
  const getFreshPeerKey = useCallback(async (): Promise<string | null> => {
    const cache = peerKeyCacheRef.current;
    if (cache.key !== null && Date.now() - cache.fetchedAt < PEER_KEY_TTL_MS) {
      return cache.key;
    }
    return loadPeer();
  }, [loadPeer]);

  // Ensure current user has E2EE keys; detect mismatch with server-stored key
  useEffect(() => {
    let cancelled = false;
    syncKeyWithServer(SERVER_URL).then((result) => {
      if (cancelled) return;
      setKeyStatus(result.status);
      setServerFingerprint(result.serverFingerprint);
      ownPublicKeyRef.current = getStoredPublicKey();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const resyncKey = useCallback(async () => {
    try {
      await uploadKeyWithProof(SERVER_URL);
      const result = await syncKeyWithServer(SERVER_URL);
      setKeyStatus(result.status);
      setServerFingerprint(result.serverFingerprint);
      ownPublicKeyRef.current = getStoredPublicKey();
      toast.success('Key re-synced — new messages will decrypt correctly');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to re-sync key');
    }
  }, [toast]);

  const clearHistory = useCallback(async () => {
    if (!window.confirm('Clear all messages in this conversation? This can\'t be undone.')) return;
    try {
      const res = await fetch(
        `${SERVER_URL}/chat/history/${encodeURIComponent(roomId)}`,
        { method: 'DELETE', credentials: 'include' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear history');
      setMessages([]);
      messageIdsRef.current.clear();
      readEmittedRef.current.clear();
      lastProcessedCountRef.current = 0;
      pageRef.current = 1;
      prevListRef.current = { count: 0, oldestId: null };
      void loadMessages(1, false);
      toast.success('Conversation cleared');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to clear history');
    }
  }, [roomId, loadMessages, toast]);

  useEffect(() => {
    if (!otherUserId) return;
    fetch(`${SERVER_URL}/chat/online-status/${encodeURIComponent(otherUserId)}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((d) => setPeerOnline(!!d.online))
      .catch(() => {});
  }, [otherUserId]);

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
        toast.error(e instanceof Error ? e.message : 'Failed to react');
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
      void loadMessages(1, false);
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
          ? decryptMessage(ciphertext).then(
              (decrypted) => ({ text: decrypted, decryptionFailed: false }),
              () => ({ text: '', decryptionFailed: true })
            )
          : Promise.resolve({ text: payload.content || '', decryptionFailed: false });

        resolveText.then(({ text, decryptionFailed }) => {
          setMessages((prev) => [
            ...prev,
            {
              id: payload.id,
              key: payload.id,
              sender: 'other',
              text,
              decryptionFailed,
              createdAt: payload.createdAt || new Date().toISOString(),
              attachment: decryptionFailed ? null : parseAttachment(text),
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

      socket.on('user_typing', (data: { userId?: string; roomId?: string }) => {
        if (data.userId && data.userId !== otherUserId) return;
        if (data.roomId && data.roomId !== roomId) return;
        setPeerTyping(true);
        if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
        peerTypingTimerRef.current = setTimeout(() => setPeerTyping(false), TYPING_TIMEOUT_MS);
      });

      socket.on('user_stopped_typing', (data: { userId?: string; roomId?: string }) => {
        if (data.userId && data.userId !== otherUserId) return;
        if (data.roomId && data.roomId !== roomId) return;
        setPeerTyping(false);
        if (peerTypingTimerRef.current) {
          clearTimeout(peerTypingTimerRef.current);
          peerTypingTimerRef.current = undefined;
        }
      });

      socket.on('user_online', (data: { userId?: string }) => {
        if (data.userId === otherUserId) setPeerOnline(true);
      });

      socket.on('user_offline', (data: { userId?: string }) => {
        if (data.userId === otherUserId) setPeerOnline(false);
      });

      socket.on('key_updated', (data: { userId?: string }) => {
        if (data.userId && data.userId !== otherUserId) return;
        void loadPeer();
        toast.info('Recipient updated their encryption key — refreshing');
      });
    })();

    return () => {
      cancelled = true;
      if (typingSentRef.current) socketRef.current?.emit('typing_stop', { roomId });
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      if (peerTypingTimerRef.current) clearTimeout(peerTypingTimerRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [ready, userId, otherUserId, roomId, applyReaction, loadPeer, toast]);

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
    const { count, oldestId } = prevListRef.current;
    const appendedAtBottom = count > 0 && messages.length > count && messages[0].id === oldestId;
    if (count === 0 || appendedAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevListRef.current = { count: messages.length, oldestId: messages[0].id };
  }, [messages]);

  const stopTyping = useCallback(() => {
    const socket = socketRef.current;
    if (typingSentRef.current) {
      typingSentRef.current = false;
      socket?.emit('typing_stop', { roomId });
    }
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = undefined;
    }
  }, [roomId]);

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value.slice(0, MAX_MSG_LENGTH));
      const socket = socketRef.current;
      if (!socket?.connected) return;
      if (!typingSentRef.current) {
        typingSentRef.current = true;
        socket.emit('typing_start', { roomId });
      }
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = setTimeout(stopTyping, TYPING_STOP_MS);
    },
    [roomId, stopTyping]
  );

  const send = async (attachment?: FileAttachment) => {
    const text = attachment ? JSON.stringify(attachment) : draft.trim();
    if (!text || !userId || !otherUserId || sending) return;
    if (!attachment && text.length > MAX_MSG_LENGTH) {
      toast.error(`Message too long (max ${MAX_MSG_LENGTH} characters)`);
      return;
    }
    setSending(true);

    // Get the recipient's CURRENT key before encrypting — they may have
    // re-synced/rotated their key since this page loaded. Encrypting with a
    // stale key would make every new message undecryptable for them.
    const peerKeyForSend = await getFreshPeerKey();

    if (!peerKeyForSend && !attachment) {
      toast.error('Can\'t send — this chat isn\'t end-to-end encrypted. Ask the recipient to set up their key.');
      setSending(false);
      return;
    }
    if (!attachment) setDraft('');
    stopTyping();

    const tempId = `local-${Date.now()}-${++tempIdCounter.current}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        key: tempId,
        sender: 'me',
        text,
        createdAt: new Date().toISOString(),
        status: 'sending',
        attachment: attachment ?? null,
      },
    ]);

    let encryptedContent: string | undefined;
    let encryptedContentForSender: string | undefined;
    if (peerKeyForSend) {
      try {
        encryptedContent = await encryptMessage(peerKeyForSend, text);
        if (ownPublicKeyRef.current) {
          encryptedContentForSender = await encryptMessage(ownPublicKeyRef.current, text);
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(text);
        toast.error('Encryption failed');
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
      toast.error(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error('File too large. Max allowed is 25 MB');
      return;
    }
    setUploading(true);
    try {
      const { objectKey } = await uploadMedia(file);
      const attachment: FileAttachment = {
        type: 'file',
        fileType: file.type,
        fileName: file.name,
        objectKey,
        size: file.size,
      };
      await send(attachment);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
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
          <h1 className="text-lg font-semibold text-text-primary">Couldn&apos;t open chat</h1>
          <p className="text-sm text-text-secondary">
            {bridgeError || 'Failed to connect your session to the API.'}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <AnimatedButton onClick={retryBridge} className="px-4 py-2 text-sm">
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${
                peerOnline ? 'bg-emerald-400' : 'bg-text-muted'
              }`}
              title={peerOnline ? 'Online' : 'Offline'}
            />
            <div className="font-medium text-text-primary truncate">{peerLabel}</div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {peerTyping ? (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15 }}
                className="text-xs text-accent"
              >
                {peerLabel} is typing…
              </motion.div>
            ) : (
              <motion.div
                key="room"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-text-muted truncate max-w-xs flex items-center gap-1"
              >
                {keyStatus === 'mismatch' || keyStatus === 'unavailable' ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-500">
                    <ShieldAlert className="w-3 h-3 shrink-0" />
                    <span>Key mismatch — old messages can&apos;t be decrypted</span>
                    <button
                      type="button"
                      onClick={() => void resyncKey()}
                      className="ml-0.5 rounded-md border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium transition hover:bg-amber-500/10"
                    >
                      Re-sync
                    </button>
                  </span>
                ) : peerPublicKey ? (
                  <>
                    <Lock className="w-3 h-3" />
                    <span>End-to-end encrypted</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3 h-3 text-amber-500" />
                    <span>Not end-to-end encrypted</span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {hasUndecryptableMessages && (
            <button
              type="button"
              onClick={() => void clearHistory()}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-text-muted transition hover:border-red-400/40 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
              Clear history
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {hasMore && (
          <div className="flex justify-center">
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={loadOlder}
              disabled={loadingOlder}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-3 py-1.5 text-xs text-text-secondary transition hover:text-accent disabled:opacity-60"
            >
              {loadingOlder ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" />
              ) : null}
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </motion.button>
          </div>
        )}
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
                  ? 'ml-auto bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-900/20'
                  : 'mr-auto bg-background-secondary text-text-primary border border-border'
              }`}
            >
              {m.attachment ? (
                <MediaMessage attachment={m.attachment} />
              ) : m.decryptionFailed ? (
                <span className="inline-flex items-center gap-1.5 italic text-text-muted">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    {m.sender === 'other'
                      ? 'Message encrypted with a previous key — can\'t be decrypted. The sender may be using an outdated key — ask them to refresh.'
                      : 'Message encrypted with a previous key — can\'t be decrypted'}
                  </span>
                </span>
              ) : (
                m.text
              )}
              {m.sender === 'me' && (
                <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-white/75">
                  <span>{formatTimestamp(m.createdAt)}</span>
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
              {m.sender === 'other' && (
                <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-text-muted">
                  {formatTimestamp(m.createdAt)}
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-border p-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {!peerPublicKey && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>Not end-to-end encrypted — sending is disabled for this chat</span>
          </div>
        )}
        <div className="flex gap-2">
        <div className="relative">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              setComposerPickerOpen((v) => !v);
              setReactingTo(null);
            }}
            title="Add emoji"
            className={`rounded-xl border border-input-border bg-input-bg p-2.5 text-text-secondary transition hover:text-accent ${
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
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Attach a file"
          className="rounded-xl border border-input-border bg-input-bg p-2.5 text-text-secondary transition hover:text-accent disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
        </motion.button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => void handleFileChange(e)}
        />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          placeholder="Type a message…"
          maxLength={MAX_MSG_LENGTH}
          className="flex-1 rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <motion.button
          type="submit"
          whileHover={{ scale: sending || !draft.trim() || !peerPublicKey ? 1 : 1.05 }}
          whileTap={{ scale: sending || !draft.trim() || !peerPublicKey ? 1 : 0.92 }}
          disabled={sending || uploading || !draft.trim() || !peerPublicKey}
          className="rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white px-4 py-2 shadow-lg shadow-violet-900/25 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </motion.button>
        </div>
      </form>
    </div>
  );
}
