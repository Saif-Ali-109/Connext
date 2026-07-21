'use client';

import { motion, type Variants } from 'framer-motion';

/**
 * Shared motion primitives for the app's animated, theme-aware UI. These read
 * their colors from the CSS-variable theme (accent = violet), so they work in
 * both light and dark mode — unlike the standalone dark-only login screen.
 */

/** Fade/blur-in wrapper for page content. */
export function PageShell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Stagger container + item, for lists that reveal on mount. */
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.18 } },
};

/** Primary gradient action button with hover/press animation + shine sweep. */
export function AnimatedButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button
      whileHover={{ scale: props.disabled ? 1 : 1.02 }}
      whileTap={{ scale: props.disabled ? 1 : 0.97 }}
      {...(props as React.ComponentProps<typeof motion.button>)}
      className={`group relative overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 font-semibold text-white shadow-lg shadow-violet-900/25 transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}

/** Theme-aware field with a leading icon and violet focus glow. */
export function IconField({
  icon,
  className = '',
  ...props
}: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-input-bg px-3 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
      <span className="text-text-muted">{icon}</span>
      <input
        {...props}
        className={`flex-1 bg-transparent py-3 text-sm text-text-primary placeholder:text-text-muted outline-none ${className}`}
      />
    </div>
  );
}

/** Unified spinner — replaces the duplicated border/Loader2 spinner divs. */
export function Spinner({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-accent border-t-transparent ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
