'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UrediOtkazanCas, { type OtkazanZaIzmenu } from '@/components/UrediOtkazanCas';

/** „✎ Naplata i komentar“ na otkazanom času u Pregledu termina (kartica je link ka kalendaru). */
export default function UrediOtkazanDugme({ otkazan }: { otkazan: OtkazanZaIzmenu }) {
  const router = useRouter();
  const [otvoren, setOtvoren] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOtvoren(true);
        }}
        className={`mt-2 inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1 text-xs font-semibold shadow-sm ${
          otkazan.placeno ? 'border-indigo-300 text-indigo-800 hover:bg-indigo-50' : 'border-stone-300 text-stone-700 hover:bg-stone-50'
        }`}
      >
        ✎ Naplata i komentar
      </button>
      {otvoren && <UrediOtkazanCas otkazan={otkazan} onClose={() => setOtvoren(false)} onSacuvano={() => router.refresh()} />}
    </>
  );
}
