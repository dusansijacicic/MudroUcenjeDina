'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { updateTermMetaAsAdmin } from '@/app/admin/actions';
import type { TermCategoryRow } from '@/lib/term-categories';

export default function AdminTermMetaForm({
  termId,
  termCategories,
  initialTermCategoryId,
  initialNapomena,
}: {
  termId: string;
  termCategories: TermCategoryRow[];
  initialTermCategoryId: string;
  initialNapomena: string | null;
}) {
  const router = useRouter();
  const [termCategoryId, setTermCategoryId] = useState(() => {
    if (initialTermCategoryId && termCategories.some((c) => c.id === initialTermCategoryId)) {
      return initialTermCategoryId;
    }
    return termCategories[0]?.id ?? '';
  });
  const [napomena, setNapomena] = useState(initialNapomena ?? '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!termCategoryId) {
      toast.error('Izaberite kategoriju.');
      return;
    }
    setLoading(true);
    try {
      const res = await updateTermMetaAsAdmin(termId, {
        term_category_id: termCategoryId,
        napomena: napomena.trim() || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Podaci termina sačuvani.');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 space-y-3 mb-6">
      <h2 className="text-sm font-semibold text-stone-800">Kategorija i napomena termina</h2>
      <p className="text-xs text-stone-500">
        Napomenu za termin mogu unositi i ovde (admin) i predavač na svom dashboardu (stranica termina ili forma radionice).
      </p>
      {termCategories.length === 0 ? (
        <p className="text-sm text-amber-700">Nema kategorija. Dodajte ih u Admin → Kategorije termina.</p>
      ) : (
        <div>
          <label className="block text-xs font-medium text-stone-700 mb-1">Kategorija</label>
          <select
            value={termCategoryId}
            onChange={(e) => setTermCategoryId(e.target.value)}
            className="w-full max-w-md rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
          >
            {termCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.naziv}
                {c.jedan_klijent_po_terminu ? ' (jedno dete)' : ' (grupa)'}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-stone-700 mb-1">Napomena</label>
        <textarea
          value={napomena}
          onChange={(e) => setNapomena(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={loading || termCategories.length === 0}
        className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Čuvanje...' : 'Sačuvaj podatke termina'}
      </button>
    </div>
  );
}
