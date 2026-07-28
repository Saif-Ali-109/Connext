'use client';

import { MessageSquare, Inbox, User, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export type Section = 'chats' | 'requests' | 'profile' | 'security';

interface SidebarProps {
  active: Section;
  onSelect: (section: Section) => void;
  pendingCount: number;
}

const navItems: { id: Section; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'requests', label: 'Requests', icon: Inbox },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
];

export default function Sidebar({ active, onSelect, pendingCount }: SidebarProps) {
  return (
    <aside className="w-14 md:w-56 shrink-0 border-r border-border bg-background-primary/40 backdrop-blur-md">
      <nav className="flex flex-col gap-1 p-2 md:p-3">
        {navItems.map((item) => {
          const isActive = active === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`relative flex items-center gap-3 rounded-lg px-2 md:px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-accent'
                  : 'text-text-secondary hover:text-accent hover:bg-background-tertiary/50'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-pill"
                  className="absolute inset-0 rounded-lg bg-background-tertiary"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-3 w-full">
                <Icon className="w-5 h-5 md:w-4 md:h-4 shrink-0 mx-auto md:mx-0" />
                <span className="hidden md:inline">{item.label}</span>
                {item.id === 'requests' && pendingCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    className="ml-auto rounded-full bg-accent text-white text-xs px-2 py-0.5 hidden md:inline"
                  >
                    {pendingCount}
                  </motion.span>
                )}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
