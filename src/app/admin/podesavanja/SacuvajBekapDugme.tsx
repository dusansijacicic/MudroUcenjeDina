'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

/** Odmah napravi današnji bekap u arhivi (isto što i noćni automatski). */
export default function SacuvajBekapDugme() {
  const router = useRouter();
  const [radi, setRadi] = useState(false);

  const sacuvaj = async () => {
    setRadi(true);
    try {
      const res = await fetch('/api/admin/backup/arhiva', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; ime?: string; velicina?: number; greskeTabela?: Record<string, string> };
      if (!res.ok || data.error) {
        toast.error(`Bekap nije sačuvan: ${data.error ?? res.statusText}`);
        return;
      }
      const greske = Object.keys(data.greskeTabela ?? {});
      toast.success(
        `Sačuvano: ${data.ime} (${Math.max(1, Math.round((data.velicina ?? 0) / 1024))} KB).${greske.length ? ` Tabele koje nisu pročitane: ${greske.join(', ')}.` : ''}`
      );
      router.refresh();
    } catch {
      toast.error('Bekap nije sačuvan – proverite internet i pokušajte ponovo.');
    } finally {
      setRadi(false);
    }
  };

  return (
    <button
      type="button"
      onClick={sacuvaj}
      disabled={radi}
      className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
    >
      {radi ? 'Čuvam bekap…' : 'Sačuvaj bekap sada u arhivu'}
    </button>
  );
}
