'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { updatePotentialClient, convertPotentialClientToClient } from '@/app/admin/actions';
import type { PotentialClientStatus } from '@/app/admin/actions';

const STATUS_OPTIONS: { value: PotentialClientStatus; label: string }[] = [
  { value: 'zakazan', label: 'Zakazan' },
  { value: 'pojavio_se', label: 'Pojavio se' },
  { value: 'nije_se_pojavio', label: 'Nije se pojavio' },
  { value: 'prebacen_u_klijenta', label: 'Prebačen u klijenta' },
];

export default function PotentialClientQuickActions({
  id,
  ime,
  status,
  convertedClientId,
}: {
  id: string;
  ime: string;
  status: PotentialClientStatus;
  convertedClientId: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleStatusChange = async (newStatus: PotentialClientStatus) => {
    setLoading(true);
    const res = await updatePotentialClient(id, { status: newStatus });
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Status izmenjen.');
    router.refresh();
  };

  const handleConvert = async () => {
    if (!confirm(`Kreirati klijenta od "${ime}"? Osnovni podaci će se preneti i moći ćete da dopunite ostalo.`)) return;
    setLoading(true);
    const res = await convertPotentialClientToClient(id);
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Klijent kreiran!');
    router.push(`/admin/klijenti/${res.clientId}`);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2 shrink-0">
      <select
        value={status}
        onChange={(e) => handleStatusChange(e.target.value as PotentialClientStatus)}
        disabled={loading}
        className="text-xs rounded-lg border border-stone-300 px-2 py-1 text-stone-700 bg-white disabled:opacity-50"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {!convertedClientId && (
        <button
          type="button"
          onClick={handleConvert}
          disabled={loading}
          className="text-sm text-emerald-700 hover:text-emerald-800 font-medium disabled:opacity-50 whitespace-nowrap"
        >
          Prebaci u klijenta
        </button>
      )}
    </div>
  );
}
