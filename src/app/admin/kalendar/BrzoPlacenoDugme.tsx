'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { postaviPlacenePakete } from '@/app/admin/actions';

/**
 * „💰 +6“ na kalendaru, uz prvi neplaćeni čas deteta (odmah posle potrošenog paketa): označi narednih 6
 * kao plaćeno od tog časa, bez uključivanja moda Označi plaćeno. Kalendar se osveži sam (odgovor akcije).
 */
export default function BrzoPlacenoDugme({
  clientId,
  termTypeId,
  datum,
  slot,
  opis,
}: {
  clientId: string;
  termTypeId: string | null;
  datum: string;
  slot: number;
  opis: string;
}) {
  const [radi, setRadi] = useState(false);
  return (
    <button
      type="button"
      disabled={radi}
      aria-label={`Označi narednih 6 kao plaćeno od ${opis}`}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Označiti 6 časova kao plaćene, počev od ${opis}?`)) return;
        setRadi(true);
        const res = await postaviPlacenePakete([{ clientId, termTypeId, date: datum, slotIndex: slot, brojCasova: 6 }], []);
        setRadi(false);
        if (res.error) toast.error(res.error);
        else toast.success(`Plaćeno 6 časova od ${opis}.`);
      }}
      className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
    >
      {radi ? '…' : '💰 +6'}
    </button>
  );
}
