'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Client } from '@/types/database';

interface ClientFormProps {
  instructorId: string;
  client?: Client | null;
}

export default function ClientForm({
  instructorId,
  client,
}: ClientFormProps) {
  const router = useRouter();
  const [ime, setIme] = useState(client?.ime ?? '');
  const [prezime, setPrezime] = useState(client?.prezime ?? '');
  const [godiste, setGodiste] = useState(
    client?.godiste != null ? String(client.godiste) : ''
  );
  const [razred, setRazred] = useState(client?.razred ?? '');
  const [skola, setSkola] = useState(client?.skola ?? '');
  const [roditelj, setRoditelj] = useState(client?.roditelj ?? '');
  const [kontakt_telefon, setKontaktTelefon] = useState(
    client?.kontakt_telefon ?? ''
  );
  const [placeno_casova, setPlacenoCasova] = useState(
    client?.placeno_casova ?? 0
  );
  const [login_email, setLoginEmail] = useState(
    (client as { login_email?: string | null })?.login_email ?? ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        instructor_id: instructorId,
        ime: ime.trim(),
        prezime: prezime.trim(),
        godiste: godiste ? parseInt(godiste, 10) : null,
        razred: razred.trim() || null,
        skola: skola.trim() || null,
        roditelj: roditelj.trim() || null,
        kontakt_telefon: kontakt_telefon.trim() || null,
        placeno_casova: Math.max(0, placeno_casova),
        login_email: login_email.trim() || null,
      };
      if (client) {
        const { error: updateError } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', client.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('clients').insert(payload);
        if (insertError) throw insertError;
      }
      router.push('/dashboard/klijenti');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Greška pri čuvanju.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Ime
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
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Prezime
          </label>
          <input
            type="text"
            value={prezime}
            onChange={(e) => setPrezime(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Godište
          </label>
          <input
            type="number"
            min="1990"
            max="2030"
            value={godiste}
            onChange={(e) => setGodiste(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Razred
          </label>
          <input
            type="text"
            value={razred}
            onChange={(e) => setRazred(e.target.value)}
            placeholder="npr. 6"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Škola
        </label>
        <input
          type="text"
          value={skola}
          onChange={(e) => setSkola(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Roditelj
        </label>
        <input
          type="text"
          value={roditelj}
          onChange={(e) => setRoditelj(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Kontakt telefon
        </label>
        <input
          type="tel"
          value={kontakt_telefon}
          onChange={(e) => setKontaktTelefon(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Email za prijavu učenika
        </label>
        <input
          type="email"
          value={login_email}
          onChange={(e) => setLoginEmail(e.target.value)}
          placeholder="učenik se registruje ovim emailom i vidi svoje časove"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
        <p className="mt-1 text-xs text-stone-500">
          Ako unesete, učenik može na /registracija-ucenik da napravi nalog i vidi svoje časove.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Plaćeno časova (do sada)
        </label>
        <input
          type="number"
          min="0"
          value={placeno_casova}
          onChange={(e) => setPlacenoCasova(parseInt(e.target.value, 10) || 0)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 max-w-[120px]"
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje...' : client ? 'Sačuvaj izmene' : 'Dodaj klijenta'}
        </button>
        <Link
          href="/dashboard/klijenti"
          className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
        >
          Odustani
        </Link>
      </div>
    </form>
  );
}
