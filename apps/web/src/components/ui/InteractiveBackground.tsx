'use client';

import { useEffect } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';

/** Map a 0..1 MotionValue to a `%` string usable in CSS left/top. */
function usePercent(v: MotionValue<number>) {
  return useTransform(v, (n) => `${n * 100}%`);
}

/**
 * Full-page, theme-aware interactive background. Sits fixed behind page content
 * (pointer-events: none) so it never intercepts clicks. It layers:
 *   - slowly drifting violet/fuchsia gradient blobs,
 *   - a spotlight glow that follows the cursor (springed for smoothness),
 *   - a faint grid mask that fades toward the edges.
 *
 * Colors match the app's violet accent and read correctly in both light and
 * dark mode. Respects prefers-reduced-motion: drops the drift/cursor animation
 * and renders a calm static gradient instead.
 */
export default function InteractiveBackground() {
  const reduce = useReducedMotion();

  // Cursor-tracked spotlight. Seeded near the top-center so the glow is visible
  // before the first pointer move.
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.2);
  const x = useSpring(mx, { stiffness: 60, damping: 20, mass: 0.6 });
  const y = useSpring(my, { stiffness: 60, damping: 20, mass: 0.6 });
  const left = usePercent(x);
  const top = usePercent(y);

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth);
      my.set(e.clientY / window.innerHeight);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [mx, my, reduce]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base wash so the blobs blend into the theme background. */}
      <div className="absolute inset-0 bg-background-primary" />

      {/* Cursor-following spotlight glow. */}
      {!reduce && (
        <motion.div
          className="absolute h-[42rem] w-[42rem] rounded-full"
          style={{
            left,
            top,
            translateX: '-50%',
            translateY: '-50%',
            background:
              'radial-gradient(circle, rgba(124,58,237,0.18), rgba(124,58,237,0) 60%)',
          }}
        />
      )}

      {/* Drifting gradient blobs. */}
      <motion.div
        className="absolute -left-32 -top-24 h-[34rem] w-[34rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(99,102,241,0.35), rgba(99,102,241,0) 70%)',
        }}
        animate={reduce ? undefined : { x: [0, 60, -20, 0], y: [0, 40, 80, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-[-10rem] top-[18%] h-[30rem] w-[30rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(217,70,239,0.28), rgba(217,70,239,0) 70%)',
        }}
        animate={reduce ? undefined : { x: [0, -50, 20, 0], y: [0, 60, -30, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-12rem] left-[30%] h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(139,92,246,0.3), rgba(139,92,246,0) 70%)',
        }}
        animate={reduce ? undefined : { x: [0, 40, -40, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Faint grid, faded toward the edges with a radial mask. */}
      <div
        className="absolute inset-0 opacity-[0.15] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(124,58,237,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(124,58,237,0.5) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />
    </div>
  );
}
