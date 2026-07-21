'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { MailCheck } from 'lucide-react';

export default function VerifyRequestPage() {
  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 bg-background-primary text-text-primary">
      {/* Soft violet glow behind the card. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
        animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative max-w-md text-center space-y-4 rounded-2xl border border-border bg-background-secondary/60 p-8 backdrop-blur-sm shadow-xl"
      >
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 18 }}
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent"
        >
          <MailCheck className="h-7 w-7" />
        </motion.div>
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-text-secondary text-sm">
          We sent a 6-digit sign-in code to your inbox. Return to the sign-in screen and enter it —
          you can read the code on any device.
        </p>
        <Link href="/login" className="inline-block text-sm text-accent underline hover:opacity-80">
          Back to login
        </Link>
      </motion.div>
    </main>
  );
}
