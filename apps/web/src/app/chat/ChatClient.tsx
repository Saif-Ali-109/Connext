'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { encryptMessage, decryptMessage, getPrivateKey } from '../../lib/crypto';
import { Send, ArrowLeft, Loader2, User as UserIcon, Lock, Check, CheckCheck, Paperclip, File as FileIcon, Mic, Camera, Square, X, Trash2, Info } from 'lucide-react';
import { uploadMedia, FileAttachment } from '../../lib/media';
import MediaMessage from '../../components/chat/MediaMessage';
import Link from 'next/link';
import { useChatContract } from '../../hooks/useChatContract';
import { useAccount } from 'wagmi';
import { io, Socket } from 'socket.io-client';
import { appendRoomMessage, loadRoomMessages, saveRoomMessages, updateDeliveryState } from '../../lib/localChatStore';
import { clearAuthSession, getEncryptedItem, loadCachedContacts, saveCachedContacts } from '../../lib/storage';
import { useENS } from '../../hooks/useENS';
import { QRCodeSVG } from 'qrcode.react';
import { clearRoomMessages } from '../../lib/localChatStore';
import { getApiBaseUrl, getAuthenticatedHeaders, getNetworkErrorMessage, getSessionHealthStatus } from '../../lib/api';

const SERVER_URL = getApiBaseUrl();

interface Message {
  id: string;
  sender: 'me' | 'other';
  text: string;
  timestamp: Date;
  deliveryState?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
}

function mergeMessages(...messageGroups: Message[][]) {
  const merged = new Map<string, Message>();

  messageGroups.flat().forEach((message) => {
    const existing = merged.get(message.id);
    merged.set(message.id, {
      ...existing,
      ...message,
      timestamp: message.timestamp ?? existing?.timestamp ?? new Date(),
    });
  });

  return Array.from(merged.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function ChatContent({ roomId: roomIdProp }: { roomId?: string }) {
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();
  
  const roomIdFromQuery = searchParams?.get('roomId');
  
  const rawTargetKey = searchParams?.get('publicKey') || '';
  const targetPublicKey = decodeURIComponent(rawTargetKey).trim();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [myAddress, setMyAddress] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(roomIdProp || roomIdFromQuery || null);
  const [initialUnreadId, setInitialUnreadId] = useState<string | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [customName, setCustomName] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [recipientPublicKey, setRecipientPublicKey] = useState<string | null>(null);
  const [recipientAddress, setRecipientAddress] = useState<string | null>(null);
  const [missingPrivateKey, setMissingPrivateKey] = useState(false);
  const [socketAuthError, setSocketAuthError] = useState<string | null>(null);
  const authFailureHandledRef = useRef(false);
  const socketFailureCheckIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
const [showChatInfo, setShowChatInfo] = useState(false);
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);
const [loadingMore, setLoadingMore] = useState(false);
const [isContactTyping, setIsContactTyping] = useState(false);
const [isMeTyping, setIsMeTyping] = useState(false);
const typingTimeoutRef = useRef<number | null>(null);
const [contactOnline, setContactOnline] = useState(false);
const { ensName: recipientENS } = useENS(recipientAddress);
const [showTipModal, setShowTipModal] = useState(false);
const [tipAmount, setTipAmount] = useState('');
const { sendTip, hash: tipHash, isPending: tipPending, isConfirming: tipConfirming, isConfirmed: tipConfirmed } = useChatContract();

  const handleDeleteChat = () => {
    if (!roomId) return;
    clearRoomMessages(roomId);
    setMessages([]);
    setShowDeleteConfirm(false);
  };


  const { isConnected, address: wagmiAddress } = useAccount();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const focusInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleSessionExpired = useCallback((reason: string) => {
    if (authFailureHandledRef.current) return;
    authFailureHandledRef.current = true;
    console.error('[Chat] Session expired:', reason);
    socketRef.current?.disconnect();
    socketRef.current = null;
    clearAuthSession();
    router.push('/connect');
  }, [router]);

  useEffect(() => {
    setMounted(true);
    const storedAddress = getEncryptedItem('auth_address');
    const storedUserId = getEncryptedItem('auth_user_id');
    if (!storedAddress || !storedUserId) {
      router.replace('/connect');
    }
  }, [router]);

  useEffect(() => {
    if (mounted) {
      scrollToBottom();
    }
  }, [messages, mounted]);

  useEffect(() => {
    if (mounted && isAuthorized && !loading) {
      focusInput();
    }
  }, [mounted, isAuthorized, loading, focusInput]);

  const classifySocketFailure = useCallback(async () => {
    const failureCheckId = ++socketFailureCheckIdRef.current;

    try {
      const status = await getSessionHealthStatus();
      const socket = socketRef.current;

      if (failureCheckId !== socketFailureCheckIdRef.current || socket?.connected) {
        return;
      }

      if (status === 'invalid') {
        handleSessionExpired('Realtime authentication failed for this room.');
        return;
      }

      if (status === 'unreachable') {
        setSocketAuthError(`${getNetworkErrorMessage()} Local chat history is still available, but realtime sync is offline.`);
        return;
      }

      setSocketAuthError('Realtime connection failed while your session is still valid. Refresh the page or reopen the room.');
    } catch (error) {
      if (failureCheckId !== socketFailureCheckIdRef.current || socketRef.current?.connected) {
        return;
      }

      console.error('[Chat] Failed to classify socket connection issue:', error);
      setSocketAuthError(`${getNetworkErrorMessage()} Local chat history is still available, but realtime sync is offline.`);
    }
  }, [handleSessionExpired]);

  const init = useCallback(async () => {
    if (!mounted) return;

    const storedAddress = getEncryptedItem('auth_address');
    const storedUserId = getEncryptedItem('auth_user_id');

    if (!storedAddress || !storedUserId) {
      router.push('/connect');
      return;
    }

    if (!getPrivateKey(storedAddress)) {
      console.warn('[Chat] Missing private key for current wallet.');
      setMissingPrivateKey(true);
      setIsAuthorized(false);
      setLoading(false);
      return;
    }

    setMyAddress(storedAddress);
    setUserId(storedUserId);

    try {
      let contacts: any[] = [];
      try {
        const res = await fetch(`${SERVER_URL}/chat/requests?userId=${storedUserId}`, {
          headers: getAuthenticatedHeaders(),
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch contacts');
        }
        contacts = data.contacts || [];
        saveCachedContacts(
          storedUserId,
          contacts.map((contact: any) => {
            const isFromMe = contact.from._id === storedUserId;
            const otherUser = isFromMe ? contact.to : contact.from;
            return {
              id: otherUser._id,
              publicAddress: otherUser.publicAddress,
              publicKey: otherUser.publicKey,
              username: otherUser.username,
              customName: isFromMe ? contact.fromCustomName : contact.toCustomName,
            };
          })
        );
      } catch (fetchError) {
        contacts = loadCachedContacts(storedUserId).map((contact) => ({
          from: { _id: storedUserId },
          to: {
            _id: contact.id,
            publicAddress: contact.publicAddress,
            publicKey: contact.publicKey,
            username: contact.username,
          },
          fromCustomName: contact.customName,
          toCustomName: contact.customName,
        }));
      }
      
      let activeContact = null;
      let fallbackRecipient: any = null;

      const currentRoomId = roomId || roomIdFromQuery;
      if (currentRoomId) {
        // Find contact by roomId
        activeContact = contacts.find((c: any) => {
          const otherUser = c.from._id === storedUserId ? c.to : c.from;
          const rid = [storedAddress.toLowerCase().trim(), otherUser.publicAddress.toLowerCase().trim()].sort().join('-');
          return rid === currentRoomId;
        });

        if (!activeContact) {
          const [roomLeft, roomRight] = currentRoomId.split('-');
          const storedWallet = storedAddress.toLowerCase().trim();
          const otherWallet = roomLeft?.toLowerCase().trim() === storedWallet
            ? roomRight
            : roomRight?.toLowerCase().trim() === storedWallet
              ? roomLeft
              : null;

          if (otherWallet) {
            try {
              const lookupRes = await fetch(`${SERVER_URL}/auth/user/${encodeURIComponent(otherWallet)}`, {
                headers: getAuthenticatedHeaders(),
                credentials: 'include',
              });
              const lookupData = await lookupRes.json();
              if (lookupRes.ok && lookupData.user) {
                fallbackRecipient = lookupData.user;
              }
            } catch (lookupError) {
              console.error('[Chat] Failed to lookup room recipient:', lookupError);
            }
          }
        }
      } else if (targetPublicKey) {
        // Find contact by publicKey/address (legacy support or first hit)
        activeContact = contacts.find((c: any) => {
          const otherUser = c.from._id === storedUserId ? c.to : c.from;
          const normalizedTarget = targetPublicKey.trim();
          return (otherUser.publicKey?.trim() === normalizedTarget) || 
                 (otherUser.publicAddress?.toLowerCase() === normalizedTarget.toLowerCase());
        });
      }

      if (!activeContact) {
        if (currentRoomId && fallbackRecipient) {
          activeContact = {
            from: { _id: storedUserId, publicAddress: storedAddress },
            to: {
              _id: fallbackRecipient._id,
              publicAddress: fallbackRecipient.publicAddress,
              publicKey: fallbackRecipient.publicKey,
              username: fallbackRecipient.username,
              displayName: fallbackRecipient.displayName,
            },
            fromCustomName: null,
            toCustomName: null,
          };
        }
      }

      if (!activeContact) {
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      const isFromMe = activeContact.from._id === storedUserId;
      const otherUser = isFromMe ? activeContact.to : activeContact.from;
      setTargetUserId(otherUser._id);
      setRecipientPublicKey(otherUser.publicKey);
      setRecipientAddress(otherUser.publicAddress);
      setCustomName(isFromMe ? activeContact.fromCustomName : activeContact.toCustomName);
      setIsAuthorized(true);

      const rid = [storedAddress.toLowerCase().trim(), otherUser.publicAddress.toLowerCase().trim()].sort().join('-');
      setRoomId(rid);

      // If we are on /chat?publicKey=... redirect to /chat?roomId=...
      if (!roomIdFromQuery && !roomId) {
        router.push(`/chat/${rid}`, { scroll: false });
      }

      const localMessages: Message[] = loadRoomMessages(rid).map((msg) => ({
        id: msg.id,
        sender: msg.sender,
        text: msg.text,
        timestamp: new Date(msg.createdAt),
        deliveryState: msg.deliveryState as any,
      }));

      // Identify the first unread message to show the separator
      const firstUnread = localMessages.find(m => m.sender === 'other' && m.deliveryState !== 'read');
      if (firstUnread) {
        setInitialUnreadId(firstUnread.id);
      }

      let nextMessages = localMessages;
      let totalPages = 1;

      try {
        const privateKey = getPrivateKey(storedAddress);
        if (!privateKey) {
          throw new Error('Private key not found');
        }

        const res = await fetch(`${SERVER_URL}/chat/messages/${rid}?currentUserId=${storedUserId}&page=1&limit=20`, {
          headers: getAuthenticatedHeaders(),
          credentials: 'include',
        });
        const remoteData = await res.json();

        if (!res.ok) {
          throw new Error(remoteData.error || 'Failed to fetch room messages');
        }

        const remoteMessages = remoteData.messages || [];
        setHasMore(remoteData.hasMore || false);
        setPage(1);

        const decryptedRemoteMessages: Message[] = await Promise.all(
          (remoteMessages || []).map(async (msg: any) => {
            const cipher = msg.sender === 'me'
              ? msg.encryptedContentForSender || msg.text
              : msg.text;

            let text = '(Cannot decrypt)';
            if (cipher) {
              try {
                text = await decryptMessage(privateKey, cipher);
              } catch (error) {
                console.error('Failed to decrypt synced message:', error);
              }
            }

            return {
              id: msg.id,
              sender: msg.sender,
              text,
              timestamp: new Date(msg.createdAt),
              deliveryState: msg.deliveryState as any,
            };
          })
        );

        nextMessages = mergeMessages(localMessages, decryptedRemoteMessages);
        saveRoomMessages(
          rid,
          nextMessages.map((msg) => ({
            id: msg.id,
            roomId: rid,
            sender: msg.sender,
            text: msg.text,
            createdAt: msg.timestamp.toISOString(),
            ttlExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
            deliveryState: msg.deliveryState,
          }))
        );

        // Notify sender about delivery for newly synced messages from 'other'
        if (socketRef.current?.connected) {
          decryptedRemoteMessages.forEach(msg => {
            if (msg.sender === 'other' && msg.deliveryState !== 'read') {
              socketRef.current?.emit('message_delivered', { roomId: rid, messageId: msg.id });
            }
          });
        }
      } catch (error) {
        console.error('Failed to sync room messages from server:', error);
      }

      setMessages(nextMessages);
      setLoading(false);
    } catch (error) {
      console.error('Init error:', error);
      setIsAuthorized(false);
      setLoading(false);
    }
  }, [targetPublicKey, roomId, roomIdFromQuery, router, mounted]);

  useEffect(() => {
    init();
  }, [init]);

  // Mark messages as read when window is focused or messages change
  const markAsRead = useCallback(() => {
    if (!mounted || !roomId || !socketRef.current || !isAuthorized) return;
    
    const unreadFromOther = messages.filter(m => m.sender === 'other' && m.deliveryState !== 'read');
    if (unreadFromOther.length > 0) {
      unreadFromOther.forEach(m => {
        socketRef.current?.emit('message_read', { roomId, messageId: m.id });
        // Update local state
        setMessages(prev => prev.map(msg => msg.id === m.id ? { ...msg, deliveryState: 'read' } : msg));
        updateDeliveryState(roomId, m.id, 'read');
      });
      setInitialUnreadId(null);
    }
  }, [mounted, roomId, messages, isAuthorized]);

  const loadMoreMessages = useCallback(async () => {
    if (!roomId || !userId || loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`${SERVER_URL}/chat/messages/${roomId}?currentUserId=${userId}&page=${nextPage}&limit=20`, {
        headers: getAuthenticatedHeaders(),
        credentials: 'include',
      });
      const remoteData = await res.json();
      
      if (!res.ok) throw new Error(remoteData.error || 'Failed to load messages');
      
      const privateKey = getPrivateKey(myAddress || '');
      if (!privateKey) throw new Error('Private key not found');
      
      const decryptedOlderMessages: Message[] = await Promise.all(
        (remoteData.messages || []).map(async (msg: any) => {
          const cipher = msg.sender === 'me' ? msg.encryptedContentForSender || msg.text : msg.text;
          let text = '(Cannot decrypt)';
          if (cipher) {
            try { text = await decryptMessage(privateKey, cipher); } catch (e) { console.error('Decrypt error:', e); }
          }
          return {
            id: msg.id,
            sender: msg.sender,
            text,
            timestamp: new Date(msg.createdAt),
            deliveryState: msg.deliveryState as any,
          };
        })
      );
      
      setMessages(prev => [...decryptedOlderMessages.reverse(), ...prev]);
      setPage(nextPage);
      setHasMore(remoteData.hasMore || false);
    } catch (error) {
      console.error('Failed to load older messages:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [roomId, userId, loadingMore, hasMore, page, myAddress]);

  useEffect(() => {
    if (document.visibilityState === 'visible') {
      markAsRead();
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markAsRead();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [markAsRead]);

  useEffect(() => {
    if (!mounted || !roomId || !myAddress || !isAuthorized || !recipientAddress) return;
    
    console.log(`[Socket] Connecting for room ${roomId}`);
    setSocketAuthError(null);
    const socket = io(SERVER_URL, {
      transports: ['polling', 'websocket'], 
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 30000,
      withCredentials: true, // Send cookies with socket connection
    });
    
    socketRef.current = socket;

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      
      // If the error is clearly authentication-related, expire the session immediately
      if (err.message.toLowerCase().includes('auth') || err.message.toLowerCase().includes('token')) {
        handleSessionExpired(`Authentication failed: ${err.message}`);
        return;
      }
      
      void classifySocketFailure();
    });

    socket.on('connect', () => {
      console.log('[Socket] CONNECTED');
      setSocketAuthError(null);
      void classifySocketFailure();
    });

    socket.io.on('reconnect_attempt', () => {
      void classifySocketFailure();
    });

    socket.io.on('reconnect', () => {
      socketFailureCheckIdRef.current += 1;
      setSocketAuthError(null);
    });

    if (socket.connected) {
      const joinPayload = {
        roomId,
        otherIdentifier: recipientAddress || targetPublicKey || recipientPublicKey || undefined,
      };
      console.log('[Socket] Already connected, joining room with payload:', joinPayload);
      socket.emit('join_room', joinPayload);
    }

    socket.on('room_joined', (data) => {
      console.log(`[Socket] Successfully joined room: ${data.roomId}`);
    });

    socket.on('receive_message', async (msg: any) => {
      console.log('[Socket] Incoming message event:', msg.id, 'for room:', msg.roomId);
      if (msg?.roomId && msg.roomId !== roomId) {
        console.log(`[Socket] Ignoring message for non-active room ${msg.roomId}`);
        return;
      }
      if (!msg?.encryptedContent) {
        console.warn('[Socket] Message received but missing encryptedContent');
        return;
      }
      
      const isMe = msg.sender?.publicAddress?.toLowerCase() === myAddress.toLowerCase();
      console.log('[Socket] Message is from me:', isMe);
      
      // Decrypt immediately
      try {
        const privKey = getPrivateKey(myAddress);
        if (!privKey) return;
        const cipher = isMe ? msg.encryptedContentForSender : msg.encryptedContent;
        const text = cipher ? await decryptMessage(privKey, cipher) : '(Cannot decrypt)';

        const nextMessage: Message = {
          id: msg.id,
          sender: isMe ? 'me' : 'other',
          text,
          timestamp: new Date(msg.createdAt || Date.now()),
          deliveryState: isMe ? 'sent' : 'delivered',
        };

        setMessages((prev) => {
          // If message already exists by ID, ignore
          if (prev.some((m) => m.id === nextMessage.id)) return prev;
          
          // If it's from me, and we have a pending message with same text, replace it
          if (isMe) {
            const pendingIndex = prev.findIndex(m => m.sender === 'me' && m.deliveryState === 'pending' && m.text === text);
            if (pendingIndex !== -1) {
              const updated = [...prev];
              updated[pendingIndex] = { ...nextMessage, deliveryState: 'sent' };
              return updated;
            }
          }
          
          return [...prev, nextMessage];
        });

        appendRoomMessage(roomId, {
          id: nextMessage.id,
          roomId,
          sender: nextMessage.sender,
          text: nextMessage.text,
          createdAt: nextMessage.timestamp.toISOString(),
          deliveryState: nextMessage.deliveryState,
        });

        if (!isMe) {
          socket.emit('message_delivered', { roomId, messageId: nextMessage.id });
          if (document.visibilityState === 'visible') {
            socket.emit('message_read', { roomId, messageId: nextMessage.id });
          }
        }
      } catch (e) {
        console.error('Decryption/Process error:', e);
      }
    });

    socket.on('message_delivery_status', (payload: any) => {
      const msgId = payload.messageId || 'last_pending';
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId || (msgId === 'last_pending' && m.sender === 'me' && m.deliveryState === 'pending')) 
          ? { ...m, deliveryState: payload.delivered ? 'delivered' : 'sent' } : m)
      );
      updateDeliveryState(roomId, msgId, payload.delivered ? 'delivered' : 'sent');
    });

    socket.on('message_delivered_relay', (payload: any) => {
      const { messageId } = payload;
      setMessages((prev) => prev.map(m => m.id === messageId ? { ...m, deliveryState: 'delivered' } : m));
      updateDeliveryState(roomId, messageId, 'delivered');
    });

    socket.on('message_read_relay', (payload: any) => {
      const { messageId } = payload;
      setMessages((prev) => prev.map(m => m.id === messageId ? { ...m, deliveryState: 'read' } : m));
      updateDeliveryState(roomId, messageId, 'read');
    });

    socket.on('user_typing', ({ userId: typingUserId }) => {
      if (typingUserId !== userId) {
        setIsContactTyping(true);
      }
    });

    socket.on('user_stopped_typing', ({ userId: typingUserId }) => {
      if (typingUserId !== userId) {
        setIsContactTyping(false);
      }
    });

    socket.on('user_online', ({ userId: onlineUserId }) => {
      if (onlineUserId === targetUserId) {
        setContactOnline(true);
      }
    });

    socket.on('user_offline', ({ userId: offlineUserId }) => {
      if (offlineUserId === targetUserId) {
        setContactOnline(false);
      }
    });

    return () => {
      socketFailureCheckIdRef.current += 1;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, myAddress, isAuthorized, targetPublicKey, recipientAddress, recipientPublicKey, mounted, handleSessionExpired, classifySocketFailure]);

  
  const sendEncryptedMessage = async (outgoingText: string) => {
    if (!outgoingText || !roomId || !recipientPublicKey || !myAddress || !userId || sending) {
      console.warn('[sendEncryptedMessage] Missing data or sending already');
      return;
    }


    let pendingMessageId: string | null = null;

    try {
      setSending(true);
      setInput('');
      focusInput();

      const tempId = `temp-${Date.now()}`;
      pendingMessageId = tempId;
      const newMsg: Message = {
        id: tempId,
        sender: 'me',
        text: outgoingText,
        timestamp: new Date(),
        deliveryState: 'pending',
      };

      setMessages((prev) => [...prev, newMsg]);

      const privKey = getPrivateKey(myAddress);
      if (!privKey) throw new Error('Private key not found');

      console.log('[handleSend] Encrypting for recipient...');
      const encryptedContent = await encryptMessage(recipientPublicKey, outgoingText);
      const myPubKey = getEncryptedItem('auth_publicKey') || '';
      const encryptedContentForSender = await encryptMessage(myPubKey, outgoingText);

      if (!socketRef.current?.connected) {
        throw new Error('Real-time connection unavailable. Please reconnect your wallet and try again.');
      }

      const socketResponse = await new Promise<{ ok: boolean; error?: string; messageId?: string; delivered?: boolean }>((resolve, reject) => {
        if (!socketRef.current) {
          reject(new Error('Real-time connection unavailable.'));
          return;
        }

        const timer = window.setTimeout(() => {
          reject(new Error('Timed out waiting for realtime delivery acknowledgement.'));
        }, 5000);

        socketRef.current.emit('send_message', {
          messageId: tempId,
          recipientPublicKey: recipientAddress,
          encryptedContent,
          encryptedContentForSender,
        }, (response: { ok: boolean; error?: string; messageId?: string; delivered?: boolean }) => {
          window.clearTimeout(timer);
          resolve(response);
        });
      });

      if (!socketResponse.ok) {
        throw new Error(socketResponse.error || 'Realtime relay failed');
      }

      const finalMessageId = socketResponse.messageId || tempId;

      setMessages((prev) => 
        prev.map((m) => m.id === tempId ? {
          ...m,
          id: finalMessageId,
          deliveryState: socketResponse.delivered ? 'delivered' : 'sent'
        } : m)
      );
      
      appendRoomMessage(roomId, {
        id: finalMessageId,
        roomId,
        sender: 'me',
        text: newMsg.text,
        createdAt: newMsg.timestamp.toISOString(),
        deliveryState: socketResponse.delivered ? 'delivered' : 'sent',
      });
    } catch (error) {
      console.error('Send error:', error);
      const message = error instanceof Error ? error.message : 'Send failed';
      if (/session expired|forbidden|invalid token|authentication/i.test(message)) {
        handleSessionExpired(message);
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === pendingMessageId ? { ...m, deliveryState: 'failed' } : m))
      );
    } finally {
      setSending(false);
      focusInput();
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const outgoingText = input.trim();
    
    if (!outgoingText && !selectedFile) return;

    if (selectedFile) {
      try {
        setMediaUploading(true);
        const { objectKey } = await uploadMedia(selectedFile);
        const payload: FileAttachment & { caption?: string } = {
          type: 'file',
          fileType: selectedFile.type || 'application/octet-stream',
          fileName: selectedFile.name,
          objectKey,
          size: selectedFile.size,
          ...(outgoingText ? { caption: outgoingText } : {})
        };
        setSelectedFile(null);
        setInput('');
        await sendEncryptedMessage(JSON.stringify(payload));
      } catch (err: any) {
        console.error('File upload failed:', err);
        setMediaUploadError(err.message || 'Failed to upload media. Please check server configuration.');
      } finally {
        setMediaUploading(false);
      }
    } else {
      setInput('');
      await sendEncryptedMessage(outgoingText);
    }
  };

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentMenuOpen(false);
    setSelectedFile(file);
    setMediaUploadError(null);
    if (e.target) e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `Voice_Message_${Date.now()}.webm`, { type: 'audio/webm' });
        setSelectedFile(file);
        setMediaUploadError(null);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      setAttachmentMenuOpen(false);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background-primary text-text-primary font-sans flex flex-col">
      {loading || isAuthorized === null ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-accent animate-spin mb-4" />
          <p className="text-text-secondary font-medium">Establishing Secure Connection...</p>
        </div>
      ) : isAuthorized === false ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-24 h-24 bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mb-6">
            <Lock className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold mb-3 text-text-primary">
            {missingPrivateKey ? 'Secure Key Missing' : 'Connection Unauthorized'}
          </h2>
          <p className="text-text-secondary max-w-md mb-8">
            {missingPrivateKey
              ? 'Your wallet is connected, but the local encryption key for this browser is missing. Re-open Connect to regenerate it.'
              : 'You must have an active, accepted connection request to chat with this wallet.'}
          </p>
          <Link
            href={missingPrivateKey ? '/connect' : '/dashboard'}
            className="bg-accent hover:opacity-90 text-white font-bold py-3 px-8 rounded-2xl transition-all"
          >
            {missingPrivateKey ? 'Go to Connect' : 'Return to Dashboard'}
          </Link>
        </div>
      ) : (
        <main className="flex-1 w-full max-w-5xl min-w-0 mx-auto p-4 sm:p-6 lg:p-8 flex flex-col h-[80vh] md:h-[calc(100vh-80px)]">
          {socketAuthError ? (
            <div className="mb-4 rounded-2xl border border-amber-700/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
              {socketAuthError}
            </div>
          ) : null}
          <div className="bg-background-secondary border border-border p-4 rounded-t-3xl flex items-center justify-between shrink-0 shadow-sm z-10">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="p-2 bg-background-tertiary hover:bg-background-secondary rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5 text-text-secondary" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-accent/20 text-accent rounded-full flex items-center justify-center shrink-0 border border-accent/50 font-bold">
                  {customName ? customName[0].toUpperCase() : <UserIcon className="w-5 h-5" />}
                </div>
                    <div className="flex flex-col overflow-hidden">
                      <h2 className="font-bold text-lg leading-tight truncate max-w-[200px] text-text-primary">
                        {customName || recipientENS || "Encrypted Contact"}
                      </h2>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-mono text-text-muted truncate">
                          {recipientENS || recipientAddress?.substring(0, 12) + '...'}
                        </p>
                        {contactOnline ? (
                          <span className="flex items-center gap-1 text-[10px] text-green-400">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                            Online
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-muted">Last seen recently</span>
                        )}
                      </div>
                    </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowChatInfo(true)} className="p-2 hover:bg-background-tertiary rounded-full transition-colors" title="Chat Info">
                <Info className="w-5 h-5 text-text-secondary" />
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} className="p-2 hover:bg-red-500/20 rounded-full transition-colors" title="Delete Chat">
                <Trash2 className="w-5 h-5 text-text-secondary hover:text-red-400" />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-background-primary border-x border-border overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
            {hasMore && (
              <div className="flex justify-center">
                <button
                  onClick={loadMoreMessages}
                  disabled={loadingMore}
                  className="text-xs text-accent hover:underline disabled:opacity-50 flex items-center gap-2"
                >
                  {loadingMore ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : null}
                  {loadingMore ? 'Loading...' : 'Load older messages'}
                </button>
              </div>
            )}
            {isContactTyping && (
              <div className="flex items-center gap-2 text-text-muted text-xs italic px-2">
                <span className="flex gap-1">
                  <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce [animation-delay:0ms]"></span>
                  <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce [animation-delay:150ms]"></span>
                  <span className="w-1 h-1 bg-text-muted rounded-full animate-bounce [animation-delay:300ms]"></span>
                </span>
                Contact is typing...
              </div>
            )}
            {messages.map((msg, index) => {
              const showUnreadSeparator = initialUnreadId === msg.id;
              
              return (
                <div key={msg.id} className="flex flex-col gap-4">
                  {showUnreadSeparator && (
                    <div className="flex items-center justify-center my-6">
                      <div className="bg-background-secondary border border-border px-4 py-1.5 rounded-full shadow-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-500">
                        <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                        <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Unread Messages Below</span>
                      </div>
                    </div>
                  )}
                  <div className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`
                      max-w-[80%] sm:max-w-[70%] p-4
                      ${msg.sender === 'me' ? 'bg-accent text-white rounded-2xl shadow-md' : 'bg-background-tertiary text-text-primary rounded-2xl border border-border'}
                    `}>
                      {(() => {
                          try {
                            const payload = JSON.parse(msg.text);
                            if (payload && payload.type === 'file') {
                              return <MediaMessage attachment={payload} />;
                            }
                          } catch {}
                          return <p className="text-sm md:text-base leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>;
                        })()}
                      <div className={`text-[10px] mt-1.5 opacity-60 flex items-center justify-end gap-1 ${msg.sender === 'me' ? 'text-white' : 'text-text-muted'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.sender === 'me' && (
                          <span className="ml-1 flex items-center">
                            {msg.deliveryState === 'read' ? (
                              <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                            ) : msg.deliveryState === 'delivered' ? (
                              <CheckCheck className="w-3.5 h-3.5 text-white/70" />
                            ) : msg.deliveryState === 'sent' ? (
                              <Check className="w-3.5 h-3.5 text-white/70" />
                            ) : msg.deliveryState === 'failed' ? (
                              <span className="text-red-300">⚠</span>
                            ) : (
                              <div className="w-2 h-2 border-t-transparent border-white border-2 rounded-full animate-spin"></div>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
 
          <div className="bg-background-secondary border border-border p-4 rounded-b-3xl shrink-0 z-10">
            <form onSubmit={handleSend} className="flex flex-col gap-3 relative">
              {selectedFile && (
                <>
                  <div className="flex items-center justify-between p-3 bg-background-tertiary border border-border rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-accent/20 text-accent rounded-lg">
                        <FileIcon className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{selectedFile.name}</span>
                        <span className="text-xs text-text-muted">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setSelectedFile(null); setMediaUploadError(null); }} className="p-2 text-text-secondary hover:text-red-400 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  {mediaUploadError && (
                    <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                      Upload Error: {mediaUploadError}
                    </div>
                  )}
                </>
              )}
              <div className="flex gap-3 w-full">
              {isRecording ? (
                <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-2xl px-6 py-4 flex items-center justify-between text-red-400">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="font-mono">{Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={cancelRecording} className="p-2 hover:bg-red-500/20 rounded-full text-red-400"><X className="w-5 h-5"/></button>
                    <button type="button" onClick={stopRecording} className="p-2 bg-red-500 hover:bg-red-600 rounded-full text-white"><Check className="w-5 h-5"/></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setAttachmentMenuOpen(!attachmentMenuOpen)}
                      className={`p-4 rounded-2xl flex items-center justify-center transition-colors ${attachmentMenuOpen ? 'bg-accent/20 text-accent' : 'bg-background-tertiary text-text-secondary hover:text-text-primary border border-border'}`}
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    {attachmentMenuOpen && (
                      <div className="absolute bottom-full mb-2 left-0 w-48 bg-background-secondary border border-border rounded-xl shadow-lg overflow-hidden flex flex-col z-50">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-4 py-3 hover:bg-background-tertiary text-left text-sm transition-colors">
                          <FileIcon className="w-4 h-4 text-blue-400" /> Select File
                        </button>
                        <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-3 px-4 py-3 hover:bg-background-tertiary text-left text-sm transition-colors">
                          <Camera className="w-4 h-4 text-green-400" /> Take Photo
                        </button>
                        <button type="button" onClick={startRecording} className="flex items-center gap-3 px-4 py-3 hover:bg-background-tertiary text-left text-sm transition-colors">
                          <Mic className="w-4 h-4 text-red-400" /> Record Voice
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      if (roomId && socketRef.current?.connected) {
                        if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
                        if (!isMeTyping) {
                          setIsMeTyping(true);
                          socketRef.current.emit('typing_start', { roomId });
                        }
                        typingTimeoutRef.current = window.setTimeout(() => {
                          setIsMeTyping(false);
                          socketRef.current?.emit('typing_stop', { roomId });
                        }, 2000);
                      }
                    }}
                    placeholder={mediaUploading ? "Uploading..." : selectedFile ? "Add a caption..." : "Type an encrypted message..."}
                    disabled={mediaUploading}
                    autoFocus
                    className="flex-1 bg-background-tertiary border border-border rounded-2xl px-6 py-4 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                  <button
                    type="submit"
                    disabled={sending || mediaUploading || (!input.trim() && !selectedFile)}
                    className="bg-accent disabled:opacity-50 text-white rounded-2xl px-6 flex items-center justify-center transition-all hover:opacity-90 active:scale-95 shadow-md"
                  >
                    {(sending || mediaUploading) ? <Loader2 className="animate-spin w-5 h-5" /> : <Send className="w-5 h-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTipModal(true)}
                    className="p-4 rounded-2xl flex items-center justify-center bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors border border-yellow-500/30"
                    title="Send Tip"
                  >
                    <span className="text-sm">💎</span>
                  </button>
                </>
              )}
              </div>
            </form>
            <input type="file" ref={fileInputRef} onChange={onFileUpload} className="hidden" />
            <input type="file" accept="image/*,video/*" capture="environment" ref={cameraInputRef} onChange={onFileUpload} className="hidden" />
          </div>
        </main>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-background-secondary border border-border rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-lg font-bold mb-3 text-text-primary">Delete Chat</h3>
            <p className="text-text-secondary text-sm mb-6">
              Are you sure you want to delete this chat? This will remove all local messages for this conversation.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-2xl bg-background-tertiary hover:bg-background-primary text-text-primary font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteChat}
                className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tip Modal */}
      {showTipModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setShowTipModal(false)}>
          <div className="bg-background-secondary border border-border rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-text-primary">Send Tip</h3>
              <button onClick={() => setShowTipModal(false)} className="p-2 hover:bg-background-tertiary rounded-full transition-colors">
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-muted mb-2 block">Amount (ETH)</label>
                <input
                  type="number"
                  step="0.001"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="0.01"
                  className="w-full bg-background-tertiary border border-border rounded-2xl px-4 py-3 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              {tipHash && (
                <div className="text-xs text-text-muted break-all">
                  Tx: {tipHash}
                  {tipConfirmed && <span className="text-green-400 ml-2">✓ Confirmed</span>}
                </div>
              )}
              <button
                onClick={async () => {
                  if (!tipAmount || !recipientAddress) return;
                  const amountInEth = parseFloat(tipAmount);
                  if (isNaN(amountInEth) || amountInEth <= 0) return;
                  const amountInWei = BigInt(Math.floor(amountInEth * 1e18));
                  try {
                    await sendTip(recipientAddress, amountInWei);
                  } catch (err) {
                    console.error('Tip failed:', err);
                  }
                }}
                disabled={tipPending || !tipAmount}
                className="w-full py-3 rounded-2xl bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white font-medium transition-colors"
              >
                {tipPending ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : tipConfirming ? 'Confirming...' : 'Send Tip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Info Panel */}
      {showChatInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setShowChatInfo(false)}>
          <div className="bg-background-secondary border border-border rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-text-primary">Chat Info</h3>
              <button onClick={() => setShowChatInfo(false)} className="p-2 hover:bg-background-tertiary rounded-full transition-colors">
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-background-tertiary rounded-2xl">
                <div className="w-16 h-16 bg-accent/20 text-accent rounded-full flex items-center justify-center shrink-0 border border-accent/50 font-bold text-xl">
                  {customName ? customName[0].toUpperCase() : <UserIcon className="w-8 h-8" />}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <p className="font-bold text-text-primary truncate">{customName || "Encrypted Contact"}</p>
                  <p className="text-xs font-mono text-text-muted truncate">{recipientAddress}</p>
                </div>
              </div>
              
              {/* QR Code for wallet address */}
              {recipientAddress && (
                <div className="flex flex-col items-center p-4 bg-background-tertiary rounded-2xl">
                  <p className="text-sm text-text-muted mb-3">Share Contact QR</p>
                  <div className="bg-white p-3 rounded-xl">
                    <QRCodeSVG value={recipientAddress} size={128} />
                  </div>
                  <p className="text-xs text-text-muted mt-2">Scan to add contact</p>
                </div>
              )}
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted">Public Key</span>
                  <span className="font-mono text-text-secondary truncate max-w-[180px]" title={recipientPublicKey || undefined}>
                    {recipientPublicKey?.substring(0, 20)}...
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted">Messages</span>
                  <span className="text-text-secondary">{messages.length}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-text-muted">Room ID</span>
                  <span className="font-mono text-text-secondary truncate max-w-[180px]" title={roomId || undefined}>
                    {roomId?.substring(0, 20)}...
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatClient({ roomId }: { roomId?: string }) {
  return <ChatContent roomId={roomId} />;
}
