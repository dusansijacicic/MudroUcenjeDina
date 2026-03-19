'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Instructor } from '@/types/database';

export default function DashboardNav({ instructor, isAdminView }: { instructor: Instructor; isAdminView?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const nav = [
    { href: '/dashboard', label: 'Kalendar' },
    { href: '/dashboard/klijenti', label: 'Klijenti' },
    { href: '/dashboard/uplate', label: 'Uplate' },
    { href: '/dashboard/podesavanja', label: 'Podešavanja' },
  ];

  return (
    <header className="bg-white border-b border-stone-200 shadow-sm animate-fade-in sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between min-h-14 py-2">
        <div className="flex items-center gap-2 md:gap-6 min-w-0">
          {isAdminView && (
            <Link href="/admin" className="hidden md:inline text-sm text-stone-500 hover:text-stone-700 ui-transition rounded-md px-2 py-1 hover:bg-stone-100 shrink-0">
              ← Admin
            </Link>
          )}
          <Link href="/dashboard" className="font-semibold text-stone-800 ui-transition hover:text-amber-600 truncate shrink-0">
            Dina Kalendar
          </Link>
          <nav className="hidden md:flex gap-1 shrink-0">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium ui-transition focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${
                  pathname === href
                    ? 'bg-amber-100 text-amber-800'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden p-2 rounded-lg text-stone-600 hover:bg-stone-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <span className="text-sm text-stone-500 truncate max-w-[120px] md:max-w-none">
            {instructor.ime} {instructor.prezime}
          </span>
          <Link
            href="/promena-sifre"
            className="text-sm text-stone-500 hover:text-stone-700 ui-transition rounded-md px-3 py-2 hover:bg-stone-100 min-h-[44px] flex items-center"
          >
            Lozinka
          </Link>
          <button
            onClick={signOut}
            className="text-sm text-stone-500 hover:text-stone-700 ui-transition rounded-md px-3 py-2 hover:bg-stone-100 min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
          >
            Odjava
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-stone-200 bg-stone-50/80 px-4 py-3 flex flex-col gap-1">
          {isAdminView && (
            <Link href="/admin" onClick={() => setMobileOpen(false)} className="px-3 py-3 rounded-lg text-sm text-stone-500 hover:bg-stone-200 font-medium">
              ← Admin
            </Link>
          )}
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`px-3 py-3 rounded-lg text-sm font-medium min-h-[44px] flex items-center ${
                pathname === href ? 'bg-amber-100 text-amber-800' : 'text-stone-700 hover:bg-stone-200'
              }`}
            >
              {label}
            </Link>
          ))}
          <Link href="/promena-sifre" onClick={() => setMobileOpen(false)} className="px-3 py-3 rounded-lg text-sm font-medium min-h-[44px] flex items-center text-stone-700 hover:bg-stone-200 border-t border-stone-200 mt-2 pt-2">
            Promena lozinke
          </Link>
        </div>
      )}
    </header>
  );
}
