import type { ReactNode } from 'react';

/** Centered card used by login, signup, password reset, onboarding and join. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <p className="mb-4 text-center font-display text-3xl text-pine" aria-hidden="true">
        🎄 Family Christmas
      </p>
      <div className="card space-y-5">
        <h1 className="text-3xl">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <p
      role="status"
      className={`rounded-lg px-4 py-2 text-lg ${
        tone === 'warn' ? 'bg-cranberry-light text-cranberry-dark' : 'bg-pine-light text-pine-dark'
      }`}
    >
      {children}
    </p>
  );
}
