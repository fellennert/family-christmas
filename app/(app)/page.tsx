import Link from 'next/link';
import { Notice } from '@/components/AuthCard';
import { InstallHelp } from '@/components/pwa';
import { requireFamily } from '@/lib/data';

/** Family dashboard (SPEC §4.4.1): everyone except me, linking to their lists. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; passwordChanged?: string }>;
}) {
  const sp = await searchParams;
  const { viewer, members } = await requireFamily();
  const others = members.filter((m) => m.id !== viewer.id);

  return (
    <>
      {sp.joined && <Notice>Welcome to the family, {viewer.displayName}!</Notice>}
      {sp.passwordChanged && <Notice>Your new password is saved.</Notice>}

      <section aria-labelledby="family-title" className="space-y-4">
        <h1 id="family-title" className="text-3xl">
          Who are you shopping for?
        </h1>
        {others.length === 0 ? (
          <div className="card space-y-3">
            <p className="text-lg">It’s just you so far. Invite the rest of the family!</p>
            <Link href="/family" className="btn-primary">
              Get the invite link
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {others.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/people/${m.id}`}
                  className="card flex min-h-20 items-center justify-between gap-3 text-2xl font-semibold text-pine hover:border-pine"
                >
                  <span className="break-words">{m.displayName}</span>
                  <span aria-hidden="true" className="text-gold">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-lg">Want something yourself?</p>
        <Link href="/me" className="btn-secondary">
          Edit my wish list
        </Link>
      </section>

      <InstallHelp />
    </>
  );
}
