'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { postaviPlacenePakete } from '@/app/admin/actions';

/**
 * „Označi narednih 6 kao plaćeno“ od izabranog časa (prvi neplaćeni) – isto što i mod Označi plaćeno na
 * kalendaru, bez traženja tog časa. Uz to „samo ovaj čas“. Klik ne otvara termin ispod (zaustavlja se).
 */
export default function OznaciPlacenoDugme({
  clientId,
  termTypeId,
  datum,
  slot,
  opis,
  kompaktno = false,
}: {
  clientId: string;
  termTypeId: string | null;
  datum: string;
  slot: number;
  /** Npr. „pon 24.11. 14:45“ – za potvrdu. */
  opis: string;
  kompaktno?: boolean;
}) {
  const router = useRouter();
  const [radi, setRadi] = useState(false);

  const oznaci = async (e: React.MouseEvent, brojCasova: number) => {
    e.preventDefault();
    e.stopPropagation();
    const tekst = brojCasova === 1 ? `Označiti samo čas ${opis} kao plaćen?` : `Označiti ${brojCasova} časova kao plaćene, počev od časa ${opis}?`;
    if (!confirm(tekst)) return;
    setRadi(true);
    const res = await postaviPlacenePakete([{ clientId, termTypeId, date: datum, slotIndex: slot, brojCasova }], []);
    setRadi(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(res.dodato ? (brojCasova === 1 ? 'Plaćen je taj čas.' : `Plaćeno ${brojCasova} časova od ${opis}.`) : 'Od tog časa oznaka „plaćeno“ već postoji.');
    router.refresh();
  };

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${kompaktno ? '' : 'mt-2'}`}>
      <button
        type="button"
        onClick={(e) => oznaci(e, 6)}
        disabled={radi}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
      >
        {radi ? 'Upisujem…' : '💰 Označi narednih 6 kao plaćeno'}
      </button>
      <button
        type="button"
        onClick={(e) => oznaci(e, 1)}
        disabled={radi}
        className="rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
      >
        samo ovaj čas
      </button>
    </span>
  );
}
