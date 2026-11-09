import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Offline' };

// Fully static: the service worker stores this page and shows it when there is
// no connection. It must never contain anyone's data.
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 text-center">
      <p className="font-display text-5xl" aria-hidden="true">
        🎄
      </p>
      <h1 className="mt-4 text-3xl">You’re offline</h1>
      <p className="mt-3 text-lg">
        Family Christmas needs an internet connection. Check your Wi-Fi or mobile data, then try again.
      </p>
      {/* A plain link (not next/link) so it does a real page load. */}
      <a href="/" className="btn-primary mx-auto mt-6">
        Try again
      </a>
    </main>
  );
}
