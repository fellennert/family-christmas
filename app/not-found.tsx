import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-3xl">We couldn’t find that page</h1>
      <p className="mt-3 text-lg">It may have been removed, or the link is wrong.</p>
      <Link href="/" className="btn-primary mx-auto mt-6">
        Go home
      </Link>
    </main>
  );
}
