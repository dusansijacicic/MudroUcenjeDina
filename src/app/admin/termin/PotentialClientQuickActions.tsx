'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  updatePotentialClient,
  convertPotentialClientToClient,
  otkaziCasoveAsAdmin,
  obrisiDecuSaTestiranjaAsAdmin,
} from '@/app/admin/actions';
import type { PotentialClientStatus } from '@/app/admin/actions';

// "Otkazan" se ne bira ovde – otkazivanje ide dugmetom Otkaži (ostavlja sivi zapis na kalendaru).
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
  termId,
}: {
  id: string;
  ime: string;
  status: PotentialClientStatus;
  convertedClientId: string | null;
  /** Termin testiranja na kom je dete (null = otkazano ili termin obrisan). */
  termId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
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

  const handleOtkazi = async () => {
    if (!confirm(`Otkazati testiranje za „${ime}“? Na kalendaru ostaje sivo „otkazano“, a dete ostaje u Istoriji testiranja.`)) return;
    setLoading(true);
    const res = await otkaziCasoveAsAdmin([], [], [id]);
    setLoading(false);
    if (res.failed.length > 0) {
      toast.error(res.failed[0].error);
      return;
    }
    toast.success('Testiranje otkazano.');
    // Bilo je jedino dete – termin testiranja je obrisan (oslobođen instruktor i učionica).
    if (termId && res.obrisaniTermini.includes(termId) && pathname.startsWith(`/admin/termin/${termId}`)) {
      router.push('/admin/kalendar');
    }
    router.refresh();
  };

  const handleObrisi = async () => {
    if (!confirm(`Trajno obrisati „${ime}“ sa testiranja, BEZ TRAGA (nestaje i iz Istorije testiranja)?`)) return;
    setLoading(true);
    const res = await obrisiDecuSaTestiranjaAsAdmin([id]);
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Obrisano.');
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
      {status !== 'otkazan' && (
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
      )}
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
      {termId && status === 'zakazan' && (
        <button
          type="button"
          onClick={handleOtkazi}
          disabled={loading}
          className="text-sm text-stone-600 hover:text-stone-800 font-medium disabled:opacity-50 whitespace-nowrap"
        >
          Otkaži
        </button>
      )}
      <button
        type="button"
        onClick={handleObrisi}
        disabled={loading}
        className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50 whitespace-nowrap"
      >
        Obriši
      </button>
    </div>
  );
}
