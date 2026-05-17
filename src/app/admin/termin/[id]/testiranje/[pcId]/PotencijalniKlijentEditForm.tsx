'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { updatePotentialClient, convertPotentialClientToClient } from '@/app/admin/actions';
import type { PotentialClientRow, PotentialClientStatus } from '@/app/admin/actions';

const STATUS_OPTIONS: { value: PotentialClientStatus; label: string }[] = [
  { value: 'zakazan', label: 'Zakazan' },
  { value: 'pojavio_se', label: 'Pojavio se' },
  { value: 'nije_se_pojavio', label: 'Nije se pojavio' },
  { value: 'prebacen_u_klijenta', label: 'Prebačen u klijenta' },
];

export default function PotencijalniKlijentEditForm({
  termId,
  pc,
}: {
  termId: string;
  pc: PotentialClientRow;
}) {
  const router = useRouter();
  const [ime, setIme] = useState(pc.ime);
  const [imeRoditelja, setImeRoditelja] = useState(pc.ime_roditelja ?? '');
  const [mobilni, setMobilni] = useState(pc.mobilni_roditelja ?? '');
  const [razred, setRazred] = useState(pc.razred ?? '');
  const [status, setStatus] = useState<PotentialClientStatus>(pc.status as PotentialClientStatus);
  const [komentar, setKomentar] = useState(pc.komentar ?? '');
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await updatePotentialClient(pc.id, {
        ime: ime.trim(),
        ime_roditelja: imeRoditelja.trim() || null,
        mobilni_roditelja: mobilni.trim() || null,
        razred: razred.trim() || null,
        status,
        komentar: komentar.trim() || null,
      });
      if (result.error) { setError(result.error); toast.error(result.error); return; }
      toast.success('Sačuvano.');
      router.push(`/admin/termin/${termId}`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Greška.';
      setError(msg); toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!confirm(`Kreirati klijenta od "${ime}"? Osnovni podaci će se preneti i moći ćete da dopunite ostalo.`)) return;
    setError('');
    setConverting(true);
    try {
      const result = await convertPotentialClientToClient(pc.id);
      if (result.error) { setError(result.error); toast.error(result.error); return; }
      toast.success('Klijent kreiran!');
      router.push(`/admin/klijenti/${result.clientId}`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Greška.';
      setError(msg); toast.error(msg);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Ime deteta <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={ime}
            onChange={(e) => setIme(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Ime roditelja</label>
          <input
            type="text"
            value={imeRoditelja}
            onChange={(e) => setImeRoditelja(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Mobilni roditelja</label>
          <input
            type="tel"
            value={mobilni}
            onChange={(e) => setMobilni(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Razred</label>
          <input
            type="text"
            value={razred}
            onChange={(e) => setRazred(e.target.value)}
            className="w-full max-w-[100px] rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors ${
                  status === opt.value
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-stone-700 border-stone-300 hover:border-amber-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Komentar <span className="text-stone-400 font-normal">(opciono)</span>
          </label>
          <p className="text-xs text-stone-500 mb-1">Kako je prošlo testiranje, zašto se nije pojavio, itd.</p>
          <textarea
            value={komentar}
            onChange={(e) => setKomentar(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
            placeholder="Komentar o testiranju..."
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading || converting}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? 'Čuvanje...' : 'Sačuvaj'}
          </button>
          <Link
            href={`/admin/termin/${termId}`}
            className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            Odustani
          </Link>
        </div>
      </form>

      {/* Konverzija u klijenta */}
      {pc.converted_client_id ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-sm font-medium text-emerald-800 mb-1">Prebačen u klijenta</p>
          <Link href={`/admin/klijenti/${pc.converted_client_id}`} className="text-sm text-amber-700 hover:underline">
            → Otvori profil klijenta
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
          <p className="text-sm font-semibold text-stone-800 mb-1">Prebaci u klijenta</p>
          <p className="text-xs text-stone-500 mb-3">
            Kreiraće se novi klijent sa imenom, razredom i kontaktom. Ostatak možete dopuniti u profilu.
          </p>
          <button
            type="button"
            onClick={handleConvert}
            disabled={converting || loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {converting ? 'Kreiranje...' : 'Prebaci u klijenta →'}
          </button>
        </div>
      )}
    </div>
  );
}
