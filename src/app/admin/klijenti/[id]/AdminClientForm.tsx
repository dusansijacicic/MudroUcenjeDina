'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { updateClientAsAdmin } from '@/app/admin/actions';
import type { Client } from '@/types/database';
import ClientPolSelect from '@/components/ClientPolSelect';

export default function AdminClientForm({
  client,
  redirectAfterSave,
}: {
  client: Client;
  redirectAfterSave: string;
}) {
  const router = useRouter();
  const [ime, setIme] = useState(client.ime ?? '');
  const [prezime, setPrezime] = useState(client.prezime ?? '');
  const [pol, setPol] = useState(client.pol ?? '');
  const [godiste, setGodiste] = useState(client.godiste != null ? String(client.godiste) : '');
  const [razred, setRazred] = useState(client.razred ?? '');
  const [skola, setSkola] = useState(client.skola ?? '');
  const [roditelj, setRoditelj] = useState(client.roditelj ?? '');
  const [kontakt_telefon, setKontaktTelefon] = useState(client.kontakt_telefon ?? '');
  const [login_email, setLoginEmail] = useState(client.login_email ?? '');
  const [popust_percent, setPopustPercent] = useState(
    client.popust_percent != null ? String(client.popust_percent) : ''
  );
  const [datum_testiranja, setDatumTestiranja] = useState(
    client.datum_testiranja?.slice(0, 10) ?? ''
  );
  const [napomena, setNapomena] = useState(client.napomena ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const popustNum = popust_percent.trim() ? parseFloat(popust_percent.replace(',', '.')) : null;
    const popustInvalid = popust_percent.trim() && (
      popustNum == null || !Number.isFinite(popustNum) || (Number(popustNum) < 0 || Number(popustNum) > 100)
    );
    if (popustInvalid) {
      setError('Popust mora biti broj 0–100.');
      setLoading(false);
      return;
    }
    if (!kontakt_telefon.trim()) {
      setError('Kontakt telefon je obavezan.');
      setLoading(false);
      return;
    }
    const payload = {
      ime: ime.trim(),
      prezime: prezime.trim(),
      pol: pol.trim() || null,
      godiste: godiste ? parseInt(godiste, 10) : null,
      razred: razred.trim() || null,
      skola: skola.trim() || null,
      roditelj: roditelj.trim() || null,
      kontakt_telefon: kontakt_telefon.trim() || null,
      login_email: login_email.trim() || null,
      napomena: napomena.trim() || null,
      popust_percent: popustNum,
      datum_testiranja: datum_testiranja.trim() || null,
    };
    try {
      const result = await updateClientAsAdmin(client.id, payload);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Klijent sačuvan.');
      router.push(redirectAfterSave);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Greška pri čuvanju.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm font-semibold text-stone-800">Osnovni podaci</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Ime</label>
          <input type="text" value={ime} onChange={(e) => setIme(e.target.value)} required className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Prezime</label>
          <input type="text" value={prezime} onChange={(e) => setPrezime(e.target.value)} required className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800" />
        </div>
        <ClientPolSelect id="admin-client-pol" value={pol} onChange={setPol} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Godište</label>
          <input type="number" min="1990" max="2030" value={godiste} onChange={(e) => setGodiste(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Razred</label>
          <input type="text" value={razred} onChange={(e) => setRazred(e.target.value)} placeholder="npr. 6" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Škola</label>
        <input type="text" value={skola} onChange={(e) => setSkola(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800" />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Roditelj</label>
        <input type="text" value={roditelj} onChange={(e) => setRoditelj(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800" />
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
        <label className="block text-sm font-medium text-stone-700 mb-1">Datum testiranja</label>
        <input
          type="date"
          value={datum_testiranja}
          onChange={(e) => setDatumTestiranja(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 max-w-[220px]"
        />
        <p className="mt-1 text-xs text-stone-500">Opciono. Lista klijenata sortira se po ovom datumu (noviji prvi).</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Napomena <span className="text-stone-400 font-normal">(opciono)</span>
        </label>
        <p className="text-xs text-stone-500 mb-1">
          Interna napomena – vide je i vi i predavač koji vodi klijenta.
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
          value={login_email}
          onChange={(e) => setLoginEmail(e.target.value)}
          placeholder="nije obavezno"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Popust na nivou klijenta (%)</label>
        <input
          type="text"
          value={popust_percent}
          onChange={(e) => setPopustPercent(e.target.value)}
          placeholder="npr. 10"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 max-w-[100px]"
        />
        <p className="mt-1 text-xs text-stone-500">0–100. Ovaj klijent pri svakoj uplati ima ovaj popust (ako nije drugačije za pojedinačnu uplatu).</p>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50">
          {loading ? 'Čuvanje...' : 'Sačuvaj izmene'}
        </button>
        <Link href={redirectAfterSave} className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100">Nazad na listu</Link>
      </div>
    </form>
  );
}
