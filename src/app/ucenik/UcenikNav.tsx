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
      <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-14">
        <nav className="flex items-center gap-4" aria-label="Glavna navigacija">
          <Link href="/ucenik" className="font-semibold text-[var(--kid-text)] transition-smooth hover:text-[var(--kid-teal)] focus:outline-none focus:ring-2 focus:ring-[var(--kid-teal)] rounded-lg px-1">
            Moj pregled
          </Link>
          <Link href="/ucenik/kalendar" className="text-sm text-[#0d9488] hover:text-[#0f766e] font-medium transition-smooth rounded px-2 py-1 hover:bg-[var(--kid-teal)]/30">
            Kalendar
          </Link>
          <Link href="/ucenik/zahtev" className="text-sm text-[#0d9488] hover:text-[#0f766e] font-medium transition-smooth rounded px-2 py-1 hover:bg-[var(--kid-teal)]/30">
            Zakaži čas
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--kid-text-muted)]">
            {client.ime} {client.prezime}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-[var(--kid-text-muted)] hover:text-[var(--kid-text)] transition-smooth rounded px-2 py-1"
          >
            Odjava
          </button>
        </div>
      </div>
    </header>
  );
}
