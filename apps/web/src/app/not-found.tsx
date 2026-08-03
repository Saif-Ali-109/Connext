import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-4 rounded-2xl border border-border bg-background-primary/80 p-6 text-center backdrop-blur-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-900/25">
          <Compass className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-lg font-semibold text-text-primary">Page not found</h1>
        <p className="text-sm text-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
