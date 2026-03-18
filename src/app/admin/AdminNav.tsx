'use client';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';

const navLinks = [
  { href: '/admin', label: 'Predavači' },
  { href: '/admin/klijenti', label: 'Klijenti' },
  { href: '/admin/uplate', label: 'Evidencija uplata' },
  { href: '/admin/vrste-termina', label: 'Vrste časova' },
  { href: '/admin/ucionice', label: 'Učionice' },
  { href: '/admin/kalendar', label: 'Kalendar' },
  { href: '/admin/podesavanja', label: 'Podešavanja' },
];

export default function AdminNav() {
  const router = useRouter();
  const pathname = usePathname();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="bg-stone-800 text-white border-b border-stone-700 shadow-lg animate-fade-in">
      <div className="max-w-5xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2 min-h-14 py-2">
        <Link
          href="/admin"
          className="font-semibold text-white shrink-0 ui-transition hover:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800 rounded-md"
        >
          Dina Kalendar – Admin
        </Link>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Admin navigacija">
          {navLinks.map(({ href, label }) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium ui-transition focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800 ${
                  active
                    ? 'bg-amber-500 text-white shadow-md scale-[1.02]'
                    : 'text-stone-300 hover:bg-stone-700 hover:text-white hover:scale-[1.02] active:scale-[0.98]'
                }`}
              >
                {label}
              </Link>
            );
          })}
          <Link
            href="/admin/termin/novi"
            className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 hover:scale-[1.03] active:scale-[0.98] ui-transition shadow-md focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800"
          >
            + Zakaži termin
          </Link>
          <Link
            href="/admin/uplate/novi"
            className="px-3 py-2 rounded-lg text-sm font-medium border border-stone-500 text-stone-200 hover:bg-stone-700 hover:border-stone-500 hover:scale-[1.02] active:scale-[0.98] ui-transition focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800"
          >
            + Unesi uplatu
          </Link>
        </nav>
        <button
          onClick={signOut}
          className="text-sm text-stone-400 hover:text-white shrink-0 ui-transition rounded-md px-2 py-1 hover:bg-stone-700/80 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800"
        >
          Odjava
        </button>
      </div>
    </header>
  );
}
