'use client';

/** Shown when a page fails to load. Never displays the raw error to people. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-3xl">Something went wrong</h1>
      <p className="mt-3 text-lg">Please try again. If it keeps happening, check your internet connection.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" className="btn-primary" onClick={reset}>
          Try again
        </button>
        <a href="/" className="btn-secondary">
          Go home
        </a>
      </div>
    </main>
  );
}
