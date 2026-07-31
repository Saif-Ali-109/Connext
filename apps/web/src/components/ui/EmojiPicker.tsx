'use client';

import { useEffect, useRef } from 'react';
import data from '@emoji-mart/data';
import { Picker } from 'emoji-mart';

/**
 * Thin React wrapper around the emoji-mart v5 web-component picker. Used by
 * both the chat composer (insert at cursor) and the per-message reaction
 * popover. Kept separate from @emoji-mart/react because that wrapper only
 * declares React <=18 peer support.
 */
export default function EmojiPicker({
  onSelect,
  className = '',
}: {
  onSelect: (emoji: string) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const picker = new Picker({
      data,
      theme: 'auto',
      previewPosition: 'none',
      navPosition: 'top',
      maxFrequentRows: 1,
      onEmojiSelect: (e: { native: string }) => onSelectRef.current(e.native),
    });

    host.appendChild(picker as unknown as Node);
    return () => {
      host.removeChild(picker as unknown as Node);
    };
  }, []);

  return <div ref={hostRef} className={className} />;
}
