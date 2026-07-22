'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from '../lib/api';

const SERVER_URL = getApiBaseUrl();

export default function NotificationManager() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const socketRef = useRef<Socket | null>(null);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    if (pathname === '/login') return;

    const isRelative = SERVER_URL.startsWith('/');
    const socket = io(isRelative ? window.location.origin : SERVER_URL, {
      path: isRelative ? `${SERVER_URL}/socket.io` : undefined,
      transports: ['polling', 'websocket'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('receive_message', (payload: {
      id?: string;
      sender?: { id?: string };
      content?: string;
      encryptedContent?: string;
      roomId?: string;
    }) => {
      if (!payload?.sender?.id || payload.sender.id === userId) return;
      if (pathnameRef.current?.startsWith('/chat/')) return;

      const text = payload.content || payload.encryptedContent || 'New message';
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('New message', { body: text.slice(0, 120) });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status, userId, pathname]);

  return null;
}
