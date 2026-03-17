'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function UcenikPovezivanje() {
  const router = useRouter();
  const [status, setStatus] = useState<'linking' | 'no_client' | null>(null);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      await supabase.rpc('link_client_to_user');
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();
      if (client) {
        setStatus(null);
        router.refresh();
      } else {
        setStatus('no_client');
      }
    };
    run();
  }, [router]);

  if (status === 'no_client') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
        <div className="max-w-md rounded-xl bg-white border border-stone-200 p-6 text-center">
          <h1 className="text-lg font-semibold text-stone-800 mb-2">
            Nema povezanog naloga
          </h1>
          <p className="text-stone-600 text-sm mb-4">
            Predavač mora da unese vaš email u karticu klijenta („Email za prijavu
            učenika”). Koristite taj isti email na stranici „Registracija učenika”.
          </p>
          <Link
            href="/login"
            className="text-amber-600 hover:underline text-sm"
          >
            ← Nazad na prijavu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
      <div className="text-stone-500">Povezivanje naloga...</div>
    </div>
  );
}
