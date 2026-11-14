import type { ReactNode } from 'react';
import { FamilySwitcher } from '@/components/FamilySwitcher';
import { NavLinks } from '@/components/NavLinks';
import { requireFamily } from '@/lib/data';

/** Shell for every signed-in page: header with family name and navigation. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { family, families } = await requireFamily();

  return (
    <>
      <header className="sticky top-0 z-10 bg-pine pt-[env(safe-area-inset-top)] text-white shadow-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-3">
          <FamilySwitcher current={family} families={families} />
        </div>
        <NavLinks />
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </>
  );
}
