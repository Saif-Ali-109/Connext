'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getApiBaseUrl } from '../../lib/api';
import { AnimatedButton, PageShell } from '../../components/ui/motion';

const SERVER_URL = getApiBaseUrl();

interface Props {
  profileUsername?: string | null;
  profileDisplayName?: string | null;
  busy: boolean;
  message: string | null;
  onSave: (data: { username?: string; displayName?: string }) => Promise<void>;
}

export default function ProfileSection({
  profileUsername,
  profileDisplayName,
  busy,
  message,
  onSave,
}: Props) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (profileUsername) setUsername(profileUsername);
  }, [profileUsername]);

  useEffect(() => {
    if (profileDisplayName) setDisplayName(profileDisplayName);
  }, [profileDisplayName]);

  const usernameChanged = username.trim().toLowerCase() !== (profileUsername ?? '');
  const displayNameChanged = displayName.trim() !== (profileDisplayName ?? '');

  return (
    <>
      <PageShell>
        <h1 className="text-2xl font-semibold text-text-primary">Profile</h1>
        <p className="text-sm text-text-secondary">Manage your username and display name.</p>
      </PageShell>

      <AnimatePresence>
        {message && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="text-sm text-accent"
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="rounded-xl border border-border p-4 space-y-4 bg-background-primary/60 backdrop-blur-md">
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {profileUsername ? (
              <>Your username is <span className="font-medium text-text-primary">@{profileUsername}</span>.</>
            ) : (
              'Set a username so others can find you'
            )}
          </p>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              className="flex-1 rounded-lg border border-input-border bg-background-secondary px-3 py-2 text-sm"
            />
            <AnimatedButton
              onClick={() => onSave({ username: username.trim() })}
              disabled={busy || !usernameChanged || username.trim().length < 3}
              className="px-4 py-2 text-sm"
            >
              {profileUsername ? 'Update' : 'Save'}
            </AnimatedButton>
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-sm text-text-secondary">
            Display name — shown to people you chat with.
          </p>
          <div className="flex gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              className="flex-1 rounded-lg border border-input-border bg-background-secondary px-3 py-2 text-sm"
            />
            <AnimatedButton
              onClick={() => onSave({ displayName: displayName.trim() })}
              disabled={busy || !displayNameChanged || displayName.trim().length < 1}
              className="px-4 py-2 text-sm"
            >
              Update
            </AnimatedButton>
          </div>
        </div>
      </div>
    </>
  );
}
