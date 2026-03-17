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
    <header className="bg-white border-b border-stone-200">
      <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/ucenik" className="font-semibold text-stone-800">
          Dina Kalendar – Moj pregled
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-500">
            {client.ime} {client.prezime}
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
