'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { updateUcenikProfil } from '../actions';
import ClientPolSelect from '@/components/ClientPolSelect';
import type { Client } from '@/types/database';

export default function UcenikProfilForm({ client }: { client: Client }) {
  const router = useRouter();
  const [pol, setPol] = useState(client.pol ?? '');
  const [datum_testiranja, setDatumTestiranja] = useState(
    client.datum_testiranja?.slice(0, 10) ?? ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await updateUcenikProfil({
        pol: pol.trim() || null,
        datum_testiranja: datum_testiranja.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success('Profil je sačuvan.');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border-2 border-[var(--kid-sky-dark)]/25 bg-white/90 p-6 shadow-sm">
      <p className="text-sm text-[var(--kid-text-muted)]">
        Ime i prezime unosi predavač u sistemu. Ovde možete dopuniti <strong>pol</strong> i{' '}
        <strong>datum testiranja</strong>.
      </p>
      <ClientPolSelect id="ucenik-profil-pol" value={pol} onChange={setPol} variant="kid" />
      <div>
        <label className="block text-sm font-medium text-[var(--kid-text)] mb-1">
          Datum testiranja <span className="text-[var(--kid-text-muted)] font-normal">(opciono)</span>
        </label>
        <input
          type="date"
          value={datum_testiranja}
          onChange={(e) => setDatumTestiranja(e.target.value)}
          className="w-full max-w-[240px] rounded-xl border-2 border-[var(--kid-sky-dark)]/40 px-3 py-2.5 text-[var(--kid-text)]"
        />
        <p className="mt-1 text-xs text-[var(--kid-text-muted)]">
          Ostavite prazno ako ne želite datum. Može ga uvek uneti i predavač.
        </p>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-[var(--kid-teal)] text-white font-semibold px-5 py-2.5 hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Čuvanje...' : 'Sačuvaj'}
      </button>
    </form>
  );
}
