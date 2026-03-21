'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { createClientAsInstructor, updateClientAsInstructor } from './actions';
import type { Client } from '@/types/database';

interface ClientFormProps {
  instructorId: string;
  client?: Client | null;
  /** Ako je setovan, posle čuvanja redirect ovde (npr. za admin: /admin/view/123/klijenti) */
  redirectAfterSave?: string;
  /** Tekst za „Nazad” / „Odustani” link (opciono) */
  cancelLabel?: string;
}

export default function ClientForm({
  instructorId,
  client,
  redirectAfterSave,
  cancelLabel,
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
  const [login_email, setLoginEmail] = useState(
    (client as { login_email?: string | null })?.login_email ?? ''
  );
  const [datum_testiranja, setDatumTestiranja] = useState(
    (client as { datum_testiranja?: string | null })?.datum_testiranja?.slice(0, 10) ?? ''
  );
  const [napomena, setNapomena] = useState(client?.napomena ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!kontakt_telefon.trim()) {
      setError('Kontakt telefon je obavezan.');
      toast.error('Kontakt telefon je obavezan.');
      return;
    }
    setLoading(true);
    const clientPayload = {
      ime: ime.trim(),
      prezime: prezime.trim(),
      godiste: godiste ? parseInt(godiste, 10) : null,
      razred: razred.trim() || null,
      skola: skola.trim() || null,
      roditelj: roditelj.trim() || null,
      kontakt_telefon: kontakt_telefon.trim() || null,
      login_email: login_email.trim() || null,
      napomena: napomena.trim() || null,
      datum_testiranja: datum_testiranja.trim() || null,
    };
    try {
      if (client) {
        console.log('[ClientForm] update client', client.id);
        const result = await updateClientAsInstructor(client.id, clientPayload);
        if (result.error) {
          console.error('[ClientForm] update failed', result.error);
          setError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success('Klijent sačuvan.');
      } else {
        console.log('[ClientForm] insert client', clientPayload.ime, clientPayload.prezime);
        const result = await createClientAsInstructor(clientPayload, 0, instructorId);
        if (result.error) {
          console.error('[ClientForm] create failed', result.error);
          setError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success('Klijent je dodat.');
      }
      router.push(redirectAfterSave ?? '/dashboard/klijenti');
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Greška pri čuvanju.';
      console.error('[ClientForm] error', err);
      setError(msg);
      toast.error(msg);
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
          Kontakt telefon <span className="text-red-600">*</span>
        </label>
        <input
          type="tel"
          value={kontakt_telefon}
          onChange={(e) => setKontaktTelefon(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Datum testiranja <span className="text-stone-400 font-normal">(opciono)</span>
        </label>
        <input
          type="date"
          value={datum_testiranja}
          onChange={(e) => setDatumTestiranja(e.target.value)}
          className="w-full max-w-[220px] rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Napomena <span className="text-stone-400 font-normal">(opciono)</span>
        </label>
        <p className="text-xs text-stone-500 mb-1">
          Interna napomena – vide je i vi i admin za ovog klijenta.
        </p>
        <textarea
          value={napomena}
          onChange={(e) => setNapomena(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          placeholder="Interna napomena o klijentu..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Email za prijavu učenika <span className="text-stone-400 font-normal">(opciono)</span>
        </label>
        <input
          type="text"
          inputMode="email"
          autoComplete="email"
          value={login_email}
          onChange={(e) => setLoginEmail(e.target.value)}
          placeholder="npr. dete@email.com – ako želite da se učenik sam registruje"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
        <p className="mt-1 text-xs text-stone-500">
          Nije obavezno. Ako unesete, učenik može na /registracija-ucenik da napravi nalog i vidi svoje časove.
        </p>
      </div>
      <p className="text-sm text-stone-500">
        Stanje časova (koliko kojih ima na raspolaganju) vodi se kroz <strong>Evidenciju uplata</strong> (admin ili vi unosite uplatu: instruktor, klijent, vrsta časa, broj časova). Na stranici klijenta vidi se ostalo po vrstama.
      </p>
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
          href={redirectAfterSave ?? '/dashboard/klijenti'}
          className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
        >
          {cancelLabel ?? 'Odustani'}
        </Link>
      </div>
    </form>
  );
}
