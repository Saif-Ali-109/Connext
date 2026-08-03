'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { AnimatedButton, PageShell } from '../components/ui/motion';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageShell className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-4 rounded-2xl border border-border bg-background-primary/80 p-6 text-center backdrop-blur-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-900/25">
          <AlertTriangle className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-lg font-semibold text-text-primary">Something went wrong</h1>
        <p className="text-sm text-text-secondary">
          An unexpected error occurred while loading this page. Try again or head back to the
          dashboard.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <AnimatedButton onClick={reset} className="px-4 py-2 text-sm">
            Try again
          </AnimatedButton>
          <Link
            href="/dashboard"
            className="rounded-xl border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
