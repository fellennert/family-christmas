'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Family' },
  { href: '/me', label: 'My list' },
  { href: '/shopping', label: 'Shopping' },
  { href: '/family', label: 'Settings' },
];

/** Bottom-of-header tabs; big tap targets, current page highlighted. */
export function NavLinks() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/people/') : pathname.startsWith(href);

  return (
    <nav aria-label="Main" className="mx-auto grid max-w-2xl grid-cols-4">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(l.href) ? 'page' : undefined}
          className={`flex min-h-14 items-center justify-center border-b-4 px-1 text-center text-base font-semibold sm:text-lg ${
            isActive(l.href)
              ? 'border-gold text-white'
              : 'border-transparent text-white/85 hover:text-white'
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
