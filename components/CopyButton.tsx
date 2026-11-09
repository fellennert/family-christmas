'use client';

import { useState } from 'react';

/** Copies text to the clipboard; falls back to the native share sheet on phones. */
export function CopyButton({ text, label = 'Copy', share }: { text: string; label?: string; share?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      if (share && typeof navigator.share === 'function') {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Share sheet cancelled or clipboard blocked: nothing to do.
    }
  }

  return (
    <button type="button" className="btn-secondary" onClick={onClick}>
      <span aria-live="polite">{copied ? 'Copied!' : label}</span>
    </button>
  );
}
