'use client';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import type { Client } from '@/types/database';

export default function UcenikNav({ client }: { client: Client }) {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="bg-white/90 backdrop-blur-sm border-b border-[var(--kid-sky-dark)]/40 shadow-sm sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 flex items-center justify-between min-h-14 py-2 flex-wrap gap-2">
        <nav className="flex items-center gap-2 sm:gap-4" aria-label="Glavna navigacija">
          <Link href="/ucenik" className="font-semibold text-[var(--kid-text)] transition-smooth hover:text-[var(--kid-teal)] focus:outline-none focus:ring-2 focus:ring-[var(--kid-teal)] rounded-lg px-3 py-2 min-h-[44px] flex items-center">
            Početna
          </Link>
          <Link href="/ucenik/kalendar" className="font-semibold text-[var(--kid-teal)] transition-smooth hover:text-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[var(--kid-teal)] rounded-lg px-3 py-2 bg-[var(--kid-teal)]/15 min-h-[44px] flex items-center">
            Kalendar
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--kid-text-muted)] truncate max-w-[140px] sm:max-w-none">
            {client.ime} {client.prezime}
          </span>
          <Link href="/promena-sifre" className="text-sm text-[var(--kid-text-muted)] hover:text-[var(--kid-text)] transition-smooth rounded-lg px-3 py-2 min-h-[44px] flex items-center">
            Lozinka
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-[var(--kid-text-muted)] hover:text-[var(--kid-text)] transition-smooth rounded-lg px-3 py-2 min-h-[44px]"
          >
            Odjava
          </button>
        </div>
      </div>
    </header>
  );
}
