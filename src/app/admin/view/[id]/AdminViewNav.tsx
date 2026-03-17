'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Instructor } from '@/types/database';

export default function AdminViewNav({ instructor }: { instructor: Instructor }) {
  const pathname = usePathname();
  const base = `/admin/view/${instructor.id}`;

  const nav = [
    { href: base, label: 'Kalendar' },
    { href: `${base}/klijenti`, label: 'Klijenti' },
  ];

  return (
    <header className="bg-white border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
            ← Admin
          </Link>
          <Link href={base} className="font-semibold text-stone-800">
            {instructor.ime} {instructor.prezime}
          </Link>
          <nav className="flex gap-1">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  pathname === href || (href !== base && pathname.startsWith(href))
                    ? 'bg-amber-100 text-amber-800'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
