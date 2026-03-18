'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Instructor } from '@/types/database';

export default function DashboardNav({ instructor, isAdminView }: { instructor: Instructor; isAdminView?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const nav = [
    { href: '/dashboard', label: 'Kalendar' },
    { href: '/dashboard/zahtevi', label: 'Zahtevi' },
    { href: '/dashboard/klijenti', label: 'Klijenti' },
    { href: '/dashboard/podesavanja', label: 'Podešavanja' },
  ];

  return (
    <header className="bg-white border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          {isAdminView && (
            <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
              ← Admin
            </Link>
          )}
          <Link href="/dashboard" className="font-semibold text-stone-800">
            Dina Kalendar
          </Link>
          <nav className="flex gap-1">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  pathname === href
                    ? 'bg-amber-100 text-amber-800'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-500">
            {instructor.ime} {instructor.prezime}
          </span>
          <button
            onClick={signOut}
            className="text-sm text-stone-500 hover:text-stone-700"
          >
            Odjava
          </button>
        </div>
      </div>
    </header>
  );
}
