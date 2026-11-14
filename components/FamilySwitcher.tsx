import Link from 'next/link';
import { switchFamily } from '@/app/actions/family';
import type { FamilySummary } from '@/lib/data';

/**
 * Header title. With one family it is just the family name (as before); with
 * several it opens a short list to switch between them. Plain <details> +
 * <form>s, so it works before JavaScript loads and with big tap targets.
 */
export function FamilySwitcher({ current, families }: { current: FamilySummary; families: FamilySummary[] }) {
  if (families.length < 2) {
    return (
      <Link href="/" className="font-display text-2xl leading-tight">
        <span aria-hidden="true">🎄 </span>
        {current.name}
      </Link>
    );
  }

  return (
    <details className="group relative" data-testid="family-switcher">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-display text-2xl leading-tight [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">🎄</span>
        <span>{current.name}</span>
        <span className="font-sans text-base text-white/85" aria-hidden="true">
          ▾
        </span>
        <span className="sr-only">(switch family)</span>
      </summary>
      <div className="absolute left-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] space-y-1 rounded-2xl border border-gold/60 bg-white p-2 text-ink shadow-lg">
        <p className="px-3 pt-1 text-base text-muted">Switch family</p>
        <ul>
          {families.map((f) => (
            <li key={f.id}>
              {f.id === current.id ? (
                <span
                  aria-current="true"
                  className="flex min-h-12 items-center rounded-xl bg-cream px-3 text-lg font-semibold"
                >
                  ✓ {f.name}
                </span>
              ) : (
                <form action={switchFamily}>
                  <input type="hidden" name="familyId" value={f.id} />
                  <button
                    type="submit"
                    className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-lg hover:bg-cream"
                  >
                    {f.name}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <Link
          href="/onboarding?add=1"
          className="flex min-h-12 items-center rounded-xl px-3 text-lg text-pine underline underline-offset-4 hover:bg-cream"
        >
          Join or start another family
        </Link>
      </div>
    </details>
  );
}
