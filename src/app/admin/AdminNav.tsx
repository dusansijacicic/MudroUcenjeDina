'use client';

import { useState } from 'react';
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="bg-stone-800 text-white border-b border-stone-700 shadow-lg animate-fade-in sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between gap-2 min-h-14 py-2">
        <Link
          href="/admin"
          className="font-semibold text-white shrink-0 ui-transition hover:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800 rounded-md truncate"
        >
          Dina Kalendar – Admin
        </Link>
        <nav className="hidden md:flex flex-wrap items-center gap-1" aria-label="Admin navigacija">
          {navLinks.map(({ href, label }) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium ui-transition focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800 ${
                  active ? 'bg-amber-500 text-white' : 'text-stone-300 hover:bg-stone-700 hover:text-white'
                }`}
              >
                {label}
              </Link>
            );
          })}
          <Link href="/admin/termin/novi" className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 ui-transition shadow-md">
            + Zakaži termin
          </Link>
          <Link href="/admin/uplate/novi" className="px-3 py-2 rounded-lg text-sm font-medium border border-stone-500 text-stone-200 hover:bg-stone-700 hover:border-stone-500 ui-transition">
            + Unesi uplatu
          </Link>
        </nav>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden p-2 rounded-lg text-stone-300 hover:bg-stone-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-expanded={mobileOpen}
            aria-label="Meni"
          >
            {mobileOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            )}
          </button>
          <Link href="/promena-sifre" className="hidden md:inline text-sm text-stone-400 hover:text-white ui-transition rounded-md px-3 py-2 hover:bg-stone-700/80 min-h-[44px] flex items-center">
            Lozinka
          </Link>
          <button
            onClick={signOut}
            className="text-sm text-stone-400 hover:text-white shrink-0 ui-transition rounded-md px-3 py-2 hover:bg-stone-700/80 min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800"
          >
            Odjava
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-stone-700 bg-stone-800 px-4 py-3 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
          {navLinks.map(({ href, label }) => {
            const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`px-3 py-3 rounded-lg text-sm font-medium min-h-[44px] flex items-center ${
                  active ? 'bg-amber-500 text-white' : 'text-stone-300 hover:bg-stone-700 hover:text-white'
                }`}
              >
                {label}
              </Link>
            );
          })}
          <Link href="/admin/termin/novi" onClick={() => setMobileOpen(false)} className="px-3 py-3 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 min-h-[44px] flex items-center">
            + Zakaži termin
          </Link>
          <Link href="/admin/uplate/novi" onClick={() => setMobileOpen(false)} className="px-3 py-3 rounded-lg text-sm font-medium border border-stone-500 text-stone-200 hover:bg-stone-700 min-h-[44px] flex items-center">
            + Unesi uplatu
          </Link>
          <Link href="/promena-sifre" onClick={() => setMobileOpen(false)} className="px-3 py-3 rounded-lg text-sm font-medium text-stone-300 hover:bg-stone-700 min-h-[44px] flex items-center border-t border-stone-700 mt-2 pt-2">
            Promena lozinke
          </Link>
        </div>
      )}
    </header>
  );
}
