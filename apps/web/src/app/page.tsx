'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { Spinner } from '../components/ui/motion';

export default function Home() {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated') {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
    setLoading(false);
  }, [status, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background-primary text-text-primary font-sans">
      <motion.div
        initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center justify-center space-y-6"
      >
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="w-24 h-24 rounded-full flex items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-xl shadow-violet-900/30"
        >
          <MessageSquare className="w-12 h-12 text-white" />
        </motion.div>
        <h1 className="text-3xl font-bold">Connext</h1>
        <p className="text-text-secondary max-w-md text-center">
          Direct messaging with Google or email sign-in.
        </p>
        {loading && (
          <div className="flex items-center gap-2 text-text-secondary">
            <Spinner className="w-5 h-5" />
            <span>Checking session…</span>
          </div>
        )}
      </motion.div>
    </main>
  );
}
