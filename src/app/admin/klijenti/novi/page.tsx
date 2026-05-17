'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getAdminInstructorsList, createClientAsAdminDirect } from '../../actions';
import ClientPolSelect from '@/components/ClientPolSelect';

export default function AdminNoviKlijentPage() {
  const router = useRouter();
  const [instructors, setInstructors] = useState<{ id: string; ime: string; prezime: string }[]>([]);
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const [loadingInstructors, setLoadingInstructors] = useState(true);

  const [ime, setIme] = useState('');
  const [prezime, setPrezime] = useState('');
  const [pol, setPol] = useState('');
  const [godiste, setGodiste] = useState('');
  const [razred, setRazred] = useState('');
  const [skola, setSkola] = useState('');
  const [roditelj, setRoditelj] = useState('');
  const [kontaktTelefon, setKontaktTelefon] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [datumTestiranja, setDatumTestiranja] = useState('');
  const [napomena, setNapomena] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminInstructorsList().then((data) => {
      setInstructors(data);
      setLoadingInstructors(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!kontaktTelefon.trim()) {
      setError('Kontakt telefon je obavezan.');
      return;
    }
    setLoading(true);
    try {
      const result = await createClientAsAdminDirect({
        ime: ime.trim(),
        prezime: prezime.trim(),
        pol: pol.trim() || null,
        godiste: godiste ? parseInt(godiste, 10) : null,
        razred: razred.trim() || null,
        skola: skola.trim() || null,
        roditelj: roditelj.trim() || null,
        kontakt_telefon: kontaktTelefon.trim(),
        login_email: loginEmail.trim() || null,
        napomena: napomena.trim() || null,
        datum_testiranja: datumTestiranja.trim() || null,
        instructorId: selectedInstructorId || null,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Klijent je dodat.');
      router.push('/admin/klijenti');
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
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Novi klijent</h1>
      <p className="text-stone-500 text-sm mb-6">
        Unesite podatke učenika. Instruktor je opcioni – možete ga dodeliti sada ili kroz edit profila klijenta.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Instruktor – opcioni */}
        <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-3 space-y-2">
          <label className="block text-sm font-medium text-stone-700">
            Instruktor <span className="text-stone-400 font-normal">(opciono)</span>
          </label>
          <p className="text-xs text-stone-500">
            Ako sada izaberete instruktora, klijent će biti odmah dodeljen njemu. Možete to uraditi i kasnije.
          </p>
          {loadingInstructors ? (
            <p className="text-sm text-stone-500">Učitavanje...</p>
          ) : instructors.length === 0 ? (
            <p className="text-sm text-stone-600">
              Nema instruktora.{' '}
              <Link href="/admin/predavaci/novi" className="text-amber-600 hover:underline">
                Dodajte instruktora
              </Link>
              .
            </p>
          ) : (
            <select
              value={selectedInstructorId}
              onChange={(e) => setSelectedInstructorId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 bg-white"
            >
              <option value="">— Bez instruktora —</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ime} {i.prezime}
                </option>
              ))}
            </select>
          )}
        </div>

        <p className="text-sm font-semibold text-stone-800">Osnovni podaci</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Ime</label>
            <input
              type="text"
              value={ime}
              onChange={(e) => setIme(e.target.value)}
              required
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Prezime</label>
            <input
              type="text"
              value={prezime}
              onChange={(e) => setPrezime(e.target.value)}
              required
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
            />
          </div>
          <ClientPolSelect id="admin-novi-klijent-pol" value={pol} onChange={setPol} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Godište</label>
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
            <label className="block text-sm font-medium text-stone-700 mb-1">Razred</label>
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
          <label className="block text-sm font-medium text-stone-700 mb-1">Škola</label>
          <input
            type="text"
            value={skola}
            onChange={(e) => setSkola(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Roditelj</label>
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
            value={kontaktTelefon}
            onChange={(e) => setKontaktTelefon(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Datum testiranja</label>
          <input
            type="date"
            value={datumTestiranja}
            onChange={(e) => setDatumTestiranja(e.target.value)}
            className="w-full max-w-[220px] rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Napomena <span className="text-stone-400 font-normal">(opciono)</span>
          </label>
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
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            placeholder="nije obavezno"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? 'Čuvanje...' : 'Dodaj klijenta'}
          </button>
          <Link
            href="/admin/klijenti"
            className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            Odustani
          </Link>
        </div>
      </form>

      <p className="mt-4">
        <Link href="/admin/klijenti" className="text-sm text-amber-700 hover:underline">
          ← Nazad na sve klijente
        </Link>
      </p>
    </div>
  );
}
