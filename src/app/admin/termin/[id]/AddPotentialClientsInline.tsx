'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { addPotentialClientsAsAdmin } from '@/app/admin/actions';
import PotentialClientRowsInput, {
  emptyPotentialClientDraft,
  draftsToPayload,
  type PotentialClientDraft,
} from '@/app/admin/termin/PotentialClientRowsInput';

/** Isto polje kao pri kreiranju termina testiranja, ali za dodavanje dece na VEĆ postojeći termin
 * (npr. drugo dete/brat-sestra naknadno, ili ako je termin kreiran bez dece). */
export default function AddPotentialClientsInline({ termId }: { termId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PotentialClientDraft[]>([emptyPotentialClientDraft()]);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
      >
        + Dodaj
      </button>
    );
  }

  const handleSave = async () => {
    const payload = draftsToPayload(rows);
    if (payload.length === 0) {
      toast.error('Unesite bar ime jednog deteta.');
      return;
    }
    setLoading(true);
    const res = await addPotentialClientsAsAdmin(termId, payload);
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(payload.length === 1 ? 'Dete dodato.' : `Dodato ${payload.length} dece.`);
    setRows([emptyPotentialClientDraft()]);
    setOpen(false);
    router.refresh();
  };

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-3">
      <PotentialClientRowsInput rows={rows} onChange={setRows} disabled={loading} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje…' : 'Sačuvaj'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setRows([emptyPotentialClientDraft()]);
          }}
          disabled={loading}
          className="rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200"
        >
          Otkaži
        </button>
      </div>
    </div>
  );
}
