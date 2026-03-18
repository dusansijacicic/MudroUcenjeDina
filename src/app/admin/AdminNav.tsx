'use client';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function AdminNav() {
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="bg-stone-800 text-white border-b border-stone-700">
      <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/admin" className="font-semibold">
          Dina Kalendar – Super admin
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-sm text-stone-300 hover:text-white">
            Predavači
          </Link>
          <Link href="/admin/termin/novi" className="text-sm text-stone-300 hover:text-white">
            Zakaži termin
          </Link>
          <button
            onClick={signOut}
            className="text-sm text-stone-400 hover:text-white"
          >
            Odjava
          </button>
        </div>
      </div>
    </header>
  );
}
