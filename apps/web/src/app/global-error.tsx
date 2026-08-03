'use client';

import { AlertTriangle } from 'lucide-react';
import '../styles/globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full space-y-4 rounded-2xl border border-border bg-background-primary/80 p-6 text-center backdrop-blur-md">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-900/25">
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-text-primary">Something went wrong</h1>
            <p className="text-sm text-text-secondary">
              A critical error occurred. Try again or refresh the page.
            </p>
            <button
              type="button"
              onClick={reset}
              className="rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-900/25 hover:opacity-90"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
