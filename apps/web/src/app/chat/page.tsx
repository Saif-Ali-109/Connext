'use client';

import { MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import ChatClient from './ChatClient';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner } from '../../components/ui/motion';

function ChatIndexView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background-primary min-h-screen"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
        className="w-20 h-20 bg-background-secondary rounded-full flex items-center justify-center mb-6 shadow-sm border border-border"
      >
        <MessageSquare className="w-10 h-10 text-accent" />
      </motion.div>
      <h2 className="text-2xl font-bold mb-3 text-text-primary">Your Encrypted Conversations</h2>
      <p className="text-text-secondary max-w-sm">
        Select a contact from the list to start a secure, end-to-end encrypted chat session.
      </p>
    </motion.div>
  );
}

function ChatPageContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get('roomId');
  const publicKey = searchParams.get('publicKey');

  const hasParams = roomId || publicKey;

  if (hasParams) {
    return <ChatClient />;
  }

  return <ChatIndexView />;
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-screen bg-background-primary">
        <Spinner className="w-10 h-10" />
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
