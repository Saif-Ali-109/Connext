'use client';

import { InputHTMLAttributes, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /**
   * `themed` reads colors from the CSS-variable theme (works in light + dark),
   * for in-app pages. The default dark styling is for the standalone dark-only
   * login/signup screen.
   */
  themed?: boolean;
};

/** Password field with a show/hide eye toggle. */
export default function PasswordInput({ className = '', themed = false, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const fieldClass = themed
    ? 'w-full rounded-xl border border-border bg-input-bg px-3 py-3 pr-11 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25'
    : 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 pr-11 text-sm outline-none focus:border-zinc-400';

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${fieldClass} ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className={`absolute inset-y-0 right-0 flex items-center px-3 ${
          themed ? 'text-text-muted hover:text-accent' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
