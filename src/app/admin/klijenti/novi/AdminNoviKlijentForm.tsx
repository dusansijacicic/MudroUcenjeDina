'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { createClientAsAdminDirect } from '../../actions';
import ClientPolSelect from '@/components/ClientPolSelect';
import { findDefaultCitanjeProgramId } from '@/lib/programi';

type TermTypeOption = { id: string; naziv: string };
type ProgramStatus = { term_type_id: string; zavrseno: boolean };
type ProgramOption = { id: string; naziv: string };
type ProgramSelection = { program_id: string; zavrseno: boolean };

export default function AdminNoviKlijentForm({
  termTypes,
  programs = [],
}: {
  termTypes: TermTypeOption[];
  programs?: ProgramOption[];
}) {
  const router = useRouter();
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
  const [programStatuses, setProgramStatuses] = useState<ProgramStatus[]>([]);
  const [programiSelections, setProgramiSelections] = useState<ProgramSelection[]>(() => {
    const defaultId = findDefaultCitanjeProgramId(programs);
    return defaultId ? [{ program_id: defaultId, zavrseno: false }] : [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleProgram = (id: string) =>
    setProgramStatuses((prev) =>
      prev.some((p) => p.term_type_id === id)
        ? prev.filter((p) => p.term_type_id !== id)
        : [...prev, { term_type_id: id, zavrseno: false }]
    );

  const toggleProgramZavrseno = (id: string) =>
    setProgramStatuses((prev) =>
      prev.map((p) => (p.term_type_id === id ? { ...p, zavrseno: !p.zavrseno } : p))
    );

  const toggleProgramSelection = (id: string) =>
    setProgramiSelections((prev) =>
      prev.some((p) => p.program_id === id)
        ? prev.filter((p) => p.program_id !== id)
        : [...prev, { program_id: id, zavrseno: false }]
    );

  const toggleProgramSelectionZavrseno = (id: string) =>
    setProgramiSelections((prev) =>
      prev.map((p) => (p.program_id === id ? { ...p, zavrseno: !p.zavrseno } : p))
    );

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
        program_statuses: programStatuses,
        programi: programiSelections,
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
    <form onSubmit={handleSubmit} className="space-y-4">
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
            min="1920"
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
        <p className="mt-1 text-xs text-stone-500">Opciono. Lista klijenata sortira se po ovom datumu (noviji prvi).</p>
      </div>

      {termTypes.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-3 space-y-2">
          <label className="block text-sm font-medium text-stone-700">
            Programi koje dete pohađa <span className="text-stone-400 font-normal">(opciono)</span>
          </label>
          <p className="text-xs text-stone-500">
            Označite koje programe dete pohađa. Kad dete završi program, čekirajte „Završeno“ – ostaje u istoriji.
          </p>
          <div className="space-y-1.5">
            {termTypes.map((tt) => {
              const status = programStatuses.find((p) => p.term_type_id === tt.id);
              return (
                <div key={tt.id} className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!status}
                      onChange={() => toggleProgram(tt.id)}
                      className="rounded border-stone-300 text-amber-600"
                    />
                    <span className="text-sm text-stone-800">{tt.naziv}</span>
                  </label>
                  {status && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-stone-500">
                      <input
                        type="checkbox"
                        checked={status.zavrseno}
                        onChange={() => toggleProgramZavrseno(tt.id)}
                        className="rounded border-stone-300 text-emerald-600"
                      />
                      Završeno
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {programs.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-3 space-y-2">
          <label className="block text-sm font-medium text-stone-700">
            Program <span className="text-stone-400 font-normal">(opciono)</span>
          </label>
          <p className="text-xs text-stone-500">
            Opšta oblast koju dete pohađa (Čitanje, Matematika, Logoped, Učenje, Defektološki...).
          </p>
          <div className="space-y-1.5">
            {programs.map((p) => {
              const sel = programiSelections.find((x) => x.program_id === p.id);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!sel}
                      onChange={() => toggleProgramSelection(p.id)}
                      className="rounded border-stone-300 text-amber-600"
                    />
                    <span className="text-sm text-stone-800">{p.naziv}</span>
                  </label>
                  {sel && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-stone-500">
                      <input
                        type="checkbox"
                        checked={sel.zavrseno}
                        onChange={() => toggleProgramSelectionZavrseno(p.id)}
                        className="rounded border-stone-300 text-emerald-600"
                      />
                      Završeno
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
  );
}
