'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { createClientAsInstructor, updateClientAsInstructor } from './actions';
import type { Client } from '@/types/database';
import ClientPolSelect from '@/components/ClientPolSelect';
import { findDefaultCitanjeProgramId } from '@/lib/programi';

type TermTypeOption = { id: string; naziv: string };
type ProgramStatus = { term_type_id: string; zavrseno: boolean };
type ProgramOption = { id: string; naziv: string };
type ProgramSelection = { program_id: string; zavrseno: boolean };

interface ClientFormProps {
  instructorId: string;
  client?: Client | null;
  /** Sve vrste termina za prikaz multi-selecta pristupa */
  termTypes?: TermTypeOption[];
  /** Programi koje dete već pohađa (samo za izmenu postojećeg klijenta) */
  initialProgramStatuses?: ProgramStatus[];
  /** Svi programi (Čitanje, Matematika...) za prikaz checkbox liste */
  programs?: ProgramOption[];
  /** Koje programe dete već pohađa (samo za izmenu postojećeg klijenta) */
  initialProgrami?: ProgramSelection[];
  /** Ako je setovan, posle čuvanja redirect ovde (npr. za admin: /admin/view/123/klijenti) */
  redirectAfterSave?: string;
  /** Tekst za „Nazad” / „Odustani” link (opciono) */
  cancelLabel?: string;
}

export default function ClientForm({
  instructorId,
  client,
  termTypes = [],
  initialProgramStatuses,
  programs = [],
  initialProgrami,
  redirectAfterSave,
  cancelLabel,
}: ClientFormProps) {
  const router = useRouter();
  const [ime, setIme] = useState(client?.ime ?? '');
  const [prezime, setPrezime] = useState(client?.prezime ?? '');
  const [pol, setPol] = useState(client?.pol ?? '');
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
  const [programStatuses, setProgramStatuses] = useState<ProgramStatus[]>(initialProgramStatuses ?? []);
  const [programiSelections, setProgramiSelections] = useState<ProgramSelection[]>(() => {
    if (client) return initialProgrami ?? [];
    const defaultId = findDefaultCitanjeProgramId(programs);
    return defaultId ? [{ program_id: defaultId, zavrseno: false }] : [];
  });
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
      pol: pol.trim() || null,
      godiste: godiste ? parseInt(godiste, 10) : null,
      razred: razred.trim() || null,
      skola: skola.trim() || null,
      roditelj: roditelj.trim() || null,
      kontakt_telefon: kontakt_telefon.trim() || null,
      login_email: login_email.trim() || null,
      napomena: napomena.trim() || null,
      datum_testiranja: datum_testiranja.trim() || null,
      program_statuses: programStatuses,
      programi: programiSelections,
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
      <p className="text-sm font-semibold text-stone-800">Osnovni podaci</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
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
        <ClientPolSelect id="dashboard-client-pol" value={pol} onChange={setPol} />
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
                      onChange={() =>
                        setProgramStatuses(
                          status
                            ? programStatuses.filter((p) => p.term_type_id !== tt.id)
                            : [...programStatuses, { term_type_id: tt.id, zavrseno: false }]
                        )
                      }
                      className="rounded border-stone-300 text-amber-600"
                    />
                    <span className="text-sm text-stone-800">{tt.naziv}</span>
                  </label>
                  {status && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-stone-500">
                      <input
                        type="checkbox"
                        checked={status.zavrseno}
                        onChange={() =>
                          setProgramStatuses(
                            programStatuses.map((p) =>
                              p.term_type_id === tt.id ? { ...p, zavrseno: !p.zavrseno } : p
                            )
                          )
                        }
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
            Opšta oblast koju dete pohađa (Čitanje, Matematika, Logoped, Učenje, Defektološki...). Nezavisno od Vrsta časova iznad.
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
                      onChange={() =>
                        setProgramiSelections(
                          sel
                            ? programiSelections.filter((x) => x.program_id !== p.id)
                            : [...programiSelections, { program_id: p.id, zavrseno: false }]
                        )
                      }
                      className="rounded border-stone-300 text-amber-600"
                    />
                    <span className="text-sm text-stone-800">{p.naziv}</span>
                  </label>
                  {sel && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-stone-500">
                      <input
                        type="checkbox"
                        checked={sel.zavrseno}
                        onChange={() =>
                          setProgramiSelections(
                            programiSelections.map((x) =>
                              x.program_id === p.id ? { ...x, zavrseno: !x.zavrseno } : x
                            )
                          )
                        }
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
