// frontend/src/components/NewBadge.tsx
import React from 'react';

interface Props {
  /** Show inline (next to text) vs absolute-positioned (top-right corner of a cell) */
  variant?: 'inline' | 'dot';
}

/**
 * A pulsing red "NEW" badge — like a social network notification indicator.
 * variant="inline"  → shows a small red pill with "NEW" text (for table rows)
 * variant="dot"     → shows just a pulsing red dot (for compact spaces)
 */
export default function NewBadge({ variant = 'inline' }: Props) {
  if (variant === 'dot') {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 relative">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-40" />
      <span className="relative inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-rose-500 text-white leading-none whitespace-nowrap">
        NEW
      </span>
    </span>
  );
}
