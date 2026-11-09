'use client';

import { useEffect, useState, useTransition } from 'react';
import { signOut } from '@/app/actions/auth';

/**
 * Wipe Cache Storage (used on logout, SPEC §9a). When a service worker is
 * active it does the wiping and then re-downloads its static files (so the
 * offline page still works); otherwise we delete the caches directly.
 */
export async function clearAllCaches(): Promise<void> {
  try {
    const sw = navigator.serviceWorker?.controller;
    if (sw) {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(resolve, 3000);
        channel.port1.onmessage = () => {
          clearTimeout(timer);
          resolve();
        };
        sw.postMessage({ type: 'clear-caches' }, [channel.port2]);
      });
    } else if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Cache Storage unavailable (private mode, old browser): nothing to clear.
  }
}

/** Registers /sw.js once the page has loaded. See public/sw.js. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_SW_IN_DEV) return;
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}

export function SignOutButton({ className = 'btn-secondary' }: { className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await clearAllCaches();
          await signOut();
        })
      }
    >
      {pending ? 'Logging out…' : 'Log out'}
    </button>
  );
}

type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support tells them apart.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const DISMISS_KEY = 'install-help-dismissed';

/**
 * "Put this on your home screen" instructions. Hidden when already installed
 * or after the person dismisses it (remembered on this device only).
 */
export function InstallHelp() {
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {}
    if (!dismissed && !isStandalone()) setPlatform(detectPlatform());
  }, []);

  if (!platform) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
    setPlatform(null);
  };

  return (
    <aside className="card border-2 border-gold" aria-labelledby="install-help-title" data-testid="install-help">
      <h2 id="install-help-title" className="text-2xl">
        Put this on your home screen
      </h2>
      <p className="mt-2 text-lg">It then opens like an app, with its own icon.</p>
      {platform === 'ios' && (
        <ol className="mt-3 list-decimal space-y-1 pl-6 text-lg">
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>
            Tap the <strong>Share</strong> button (the square with an arrow pointing up).
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
        </ol>
      )}
      {platform === 'android' && (
        <ol className="mt-3 list-decimal space-y-1 pl-6 text-lg">
          <li>Open this page in <strong>Chrome</strong>.</li>
          <li>
            Tap the <strong>⋮</strong> menu at the top right.
          </li>
          <li>
            Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
          </li>
        </ol>
      )}
      {platform === 'other' && (
        <p className="mt-3 text-lg">
          On a phone, open this page and use your browser’s <strong>Add to Home Screen</strong> option. On a
          computer, look for the install icon in the address bar.
        </p>
      )}
      <button type="button" className="btn-link mt-2" onClick={dismiss}>
        Got it, hide this
      </button>
    </aside>
  );
}
