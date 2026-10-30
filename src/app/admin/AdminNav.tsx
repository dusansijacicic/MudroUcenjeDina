'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';

/** U prvom planu, tačno ovim redosledom (Kalendar, Evidencija uplata, Klijenti – ostalo je razmešteno oko akcionih dugmadi). */
const primaryLinks = [
  { href: '/admin/kalendar', label: 'Kalendar' },
  { href: '/admin/uplate', label: 'Evidencija uplata' },
  { href: '/admin/klijenti', label: 'Klijenti' },
];

/** Entiteti koji se dodaju/uređuju – retko se koristi. */
const entityLinks = [
  { href: '/admin/vrste-termina', label: 'Vrste časova' },
  { href: '/admin/kategorije-termina', label: 'Kategorije termina' },
  { href: '/admin/programi', label: 'Programi' },
  { href: '/admin/ucionice', label: 'Učionice' },
  { href: '/admin/testiranja', label: 'Testiranja' },
  { href: '/admin/blokirani', label: 'Blokirani termini' },
  { href: '/admin/predavaci', label: 'Instruktori' },
];

/** Ostalo – retko se koristi. */
const otherLinks = [
  { href: '/admin/dnevnik', label: 'Dnevnik aktivnosti' },
  { href: '/admin/podesavanja', label: 'Podešavanja' },
];

/** Deo uputstva (id sekcije u /admin/uputstvo) za stranicu na kojoj je korisnik – prvi prefiks koji odgovara. */
const UPUTSTVO_ZA_STRANICU: [string, string][] = [
  ['/admin/kalendar', 'kalendar'],
  ['/admin/termin/novi', 'zakazivanje-termina'],
  ['/admin/termin/', 'termin'],
  ['/admin/klijenti/novi', 'klijenti'],
  ['/admin/klijenti/', 'profil-klijenta'],
  ['/admin/klijenti', 'klijenti'],
  ['/admin/uplate', 'uplate'],
  ['/admin/blokirani', 'blokirani'],
  ['/admin/testiranja', 'testiranja'],
  ['/admin/predavaci', 'instruktori'],
  ['/admin/view', 'instruktori'],
  ['/admin/vrste-termina', 'sifarnici'],
  ['/admin/kategorije-termina', 'sifarnici'],
  ['/admin/programi', 'sifarnici'],
  ['/admin/ucionice', 'sifarnici'],
  ['/admin/dnevnik', 'dnevnik'],
  ['/admin/podesavanja', 'podesavanja'],
];

function uputstvoHref(pathname: string): string {
  const sekcija = UPUTSTVO_ZA_STRANICU.find(([prefiks]) => pathname.startsWith(prefiks))?.[1];
  return sekcija ? `/admin/uputstvo?deo=${sekcija}` : '/admin/uputstvo';
}

const navLinks = [...primaryLinks, ...entityLinks, ...otherLinks];

export default function AdminNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const naUputstvu = pathname.startsWith('/admin/uputstvo');
  const uputstvoClass = `px-3 py-2 rounded-lg text-sm font-semibold ui-transition ${
    naUputstvu ? 'bg-amber-500 text-white' : 'bg-sky-100 text-sky-900 hover:bg-sky-200'
  }`;

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const linkClass = (href: string) => {
    const active = pathname.startsWith(href);
    return `px-3 py-2 rounded-lg text-sm font-medium ui-transition focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800 ${
      active ? 'bg-amber-500 text-white' : 'text-stone-300 hover:bg-stone-700 hover:text-white'
    }`;
  };
  return (
    <header className="no-print bg-stone-800 text-white border-b border-stone-700 shadow-lg animate-fade-in">
      <div className="w-[90%] mx-auto px-4">
        <div className="flex items-center justify-end gap-2 py-2 md:hidden">
          <Link href={uputstvoHref(pathname)} onClick={() => setMobileOpen(false)} className={`${uputstvoClass} min-h-[44px] flex items-center`}>
            ❓ Uputstvo
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="p-2 rounded-lg text-stone-300 hover:bg-stone-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-expanded={mobileOpen}
            aria-label="Meni"
          >
            {mobileOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            )}
          </button>
        </div>
        <nav className="hidden md:flex flex-wrap items-center gap-2 py-3" aria-label="Admin navigacija">
          <Link href="/admin/termin/novi" className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 ui-transition shadow-md">
            + Zakaži termin
          </Link>
          <Link href={primaryLinks[0].href} className={linkClass(primaryLinks[0].href)}>
            {primaryLinks[0].label}
          </Link>
          <Link href="/admin/uplate/novi" className="px-3 py-2 rounded-lg text-sm font-medium border border-stone-500 text-stone-200 hover:bg-stone-700 hover:border-stone-500 ui-transition">
            + Unesi uplatu
          </Link>
          {primaryLinks.slice(1).map(({ href, label }) => (
            <Link key={href} href={href} className={linkClass(href)}>
              {label}
            </Link>
          ))}
          <span className="w-px self-stretch bg-stone-700 mx-1" aria-hidden />
          {entityLinks.map(({ href, label }) => (
            <Link key={href} href={href} className={linkClass(href)}>
              {label}
            </Link>
          ))}
          <span className="w-px self-stretch bg-stone-700 mx-1" aria-hidden />
          {otherLinks.map(({ href, label }) => (
            <Link key={href} href={href} className={linkClass(href)}>
              {label}
            </Link>
          ))}
          <Link href={uputstvoHref(pathname)} className={uputstvoClass} title="Uputstvo za ovu stranicu">
            ❓ Uputstvo
          </Link>
          <Link href="/promena-sifre" className="px-3 py-2 rounded-lg text-sm font-medium text-stone-400 hover:text-white hover:bg-stone-700/80 ui-transition">
            Lozinka
          </Link>
          <button
            onClick={signOut}
            className="px-3 py-2 rounded-lg text-sm font-medium text-stone-400 hover:text-white hover:bg-stone-700/80 ui-transition focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-800"
          >
            Odjava
          </button>
        </nav>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-stone-700 bg-stone-800 px-4 py-3 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
          <Link href="/admin/termin/novi" onClick={() => setMobileOpen(false)} className="px-3 py-3 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 min-h-[44px] flex items-center">
            + Zakaži termin
          </Link>
          <Link
            href={primaryLinks[0].href}
            onClick={() => setMobileOpen(false)}
            className={`px-3 py-3 rounded-lg text-sm font-medium min-h-[44px] flex items-center ${
              pathname.startsWith(primaryLinks[0].href) ? 'bg-amber-500 text-white' : 'text-stone-300 hover:bg-stone-700 hover:text-white'
            }`}
          >
            {primaryLinks[0].label}
          </Link>
          <Link href="/admin/uplate/novi" onClick={() => setMobileOpen(false)} className="px-3 py-3 rounded-lg text-sm font-medium border border-stone-500 text-stone-200 hover:bg-stone-700 min-h-[44px] flex items-center">
            + Unesi uplatu
          </Link>
          {navLinks
            .filter(({ href }) => href !== primaryLinks[0].href)
            .map(({ href, label }) => {
              const active = pathname.startsWith(href);
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
          <Link href="/promena-sifre" onClick={() => setMobileOpen(false)} className="px-3 py-3 rounded-lg text-sm font-medium text-stone-300 hover:bg-stone-700 min-h-[44px] flex items-center border-t border-stone-700 mt-2 pt-2">
            Promena lozinke
          </Link>
          <button
            onClick={() => {
              setMobileOpen(false);
              signOut();
            }}
            className="px-3 py-3 rounded-lg text-sm font-medium text-stone-300 hover:bg-stone-700 min-h-[44px] flex items-center text-left"
          >
            Odjava
          </button>
        </div>
      )}
    </header>
  );
}
