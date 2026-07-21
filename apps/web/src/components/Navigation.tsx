'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { MessageSquare, LayoutDashboard, Inbox, LogOut, Menu, X, Sun, Moon } from 'lucide-react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from './ThemeProvider';
import { clearAuthSession } from '../lib/storage';
import { signOut, useSession } from 'next-auth/react';
import { getApiBaseUrl } from '../lib/api';

export default function Navigation() {
  const [mounted, setMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { data: session, status } = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [mounted, status, router]);

  if (!mounted || status === 'loading') return null;
  if (status === 'unauthenticated') return null;

  const label =
    session?.user?.name ||
    session?.user?.email ||
    'Account';

  const logout = async () => {
    try {
      await fetch(`${getApiBaseUrl()}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    clearAuthSession();
    sessionStorage.clear();
    await signOut({ callbackUrl: '/login' });
  };

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Requests', href: '/requests', icon: Inbox },
  ];

  return (
    <nav className="bg-background-primary/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <motion.div
                whileHover={{ rotate: -8, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-900/25"
              >
                <MessageSquare className="w-5 h-5 text-white" />
              </motion.div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent to-text-primary hidden sm:block">
                Connext
              </span>
            </Link>

            <div className="hidden sm:ml-10 sm:flex sm:space-x-1">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`relative inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      active
                        ? 'text-accent'
                        : 'text-text-secondary hover:text-accent'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-md bg-background-tertiary"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative flex items-center">
                      <item.icon className="w-4 h-4 mr-2" />
                      {item.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden min-[540px]:block text-sm text-text-secondary truncate max-w-[12rem]">
              {label}
            </div>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleTheme}
              className="rounded-xl border border-border bg-background-secondary p-2 text-text-secondary hover:border-accent hover:bg-background-tertiary hover:text-accent transition-all overflow-hidden"
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ y: -18, opacity: 0, rotate: -90 }}
                  animate={{ y: 0, opacity: 1, rotate: 0 }}
                  exit={{ y: 18, opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.2 }}
                  className="block"
                >
                  {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </motion.span>
              </AnimatePresence>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={logout}
              className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-border bg-background-secondary px-3 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </motion.button>

            <button
              className="sm:hidden p-2"
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-label="Menu"
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="sm:hidden overflow-hidden"
            >
              <div className="pb-4 space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                      pathname === item.href
                        ? 'bg-background-tertiary text-accent'
                        : 'text-text-secondary hover:bg-background-tertiary'
                    }`}
                  >
                    {item.name}
                  </Link>
                ))}
                <button
                  onClick={logout}
                  className="block w-full text-left px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-background-tertiary"
                >
                  Log out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
