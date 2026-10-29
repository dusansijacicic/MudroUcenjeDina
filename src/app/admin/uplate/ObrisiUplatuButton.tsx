'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { deleteUplata } from '@/app/admin/actions';

/** Brisanje uplate uz potvrdu – posle brisanja lista se osveži (ili se ide na `afterHref`). */
export default function ObrisiUplatuButton({
  id,
  opis,
  afterHref,
  className = 'text-red-600 hover:text-red-700 font-medium',
}: {
  id: string;
  /** Npr. "5.000 RSD za Ana Petrović (4 časa)" – ide u pitanje za potvrdu. */
  opis: string;
  afterHref?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!window.confirm(`Obrisati uplatu: ${opis}?\n\nDetetu se smanjuje broj plaćenih časova.`)) return;
    setLoading(true);
    const res = await deleteUplata(id);
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Uplata obrisana.');
    if (afterHref) router.push(afterHref);
    router.refresh();
  };

  return (
    <button type="button" onClick={handleClick} disabled={loading} className={`${className} disabled:opacity-50`}>
      {loading ? 'Brišem…' : 'Obriši'}
    </button>
  );
}
