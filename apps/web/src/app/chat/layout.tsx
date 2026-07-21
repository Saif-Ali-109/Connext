'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getApiBaseUrl } from '../../lib/api';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status !== 'authenticated') return;

    void fetch(`${getApiBaseUrl()}/auth/session`, { credentials: 'include' }).then((res) => {
      if (!res.ok) router.push('/login');
    });
  }, [status, router]);

  if (status === 'loading') return null;

  return <div className="min-h-screen bg-background-primary text-text-primary">{children}</div>;
}
