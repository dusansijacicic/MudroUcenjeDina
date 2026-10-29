'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { createUplata, updateUplata } from '@/app/admin/actions';
import SingleKlijentPicker from '@/components/SingleKlijentPicker';

type Option = { id: string; ime?: string; prezime?: string; naziv?: string };
type ClientOption = Option & { popust_percent?: number };
type TermTypeOption = Option & { cena_po_casu?: number | null };

/** Postojeća uplata – forma je tada u režimu izmene. */
export type UplataInitial = {
  id: string;
  instructorId: string;
  clientId: string;
  iznos: number | null;
  termTypeId: string | null;
  brojCasova: number;
  popustPercent: number | null;
  napomena: string | null;
};

type CalcInput = { termTypeId: string; brojCasova: number; popustPercent: string; clientId: string };

/** Cena po času × broj časova − popust (popust uplate, a ako je prazan – popust klijenta). */
function izracunaj(termTypes: TermTypeOption[], clients: ClientOption[], f: CalcInput) {
  const tt = termTypes.find((t) => t.id === f.termTypeId);
  const cena = tt?.cena_po_casu != null && Number.isFinite(Number(tt.cena_po_casu)) ? Number(tt.cena_po_casu) : null;
  const clientPopust = Number(clients.find((c) => c.id === f.clientId)?.popust_percent ?? 0);
  const zaUplatu = f.popustPercent.trim() ? parseFloat(f.popustPercent.replace(',', '.')) : null;
  const popust =
    zaUplatu != null && Number.isFinite(zaUplatu) && zaUplatu >= 0 && zaUplatu <= 100
      ? zaUplatu
      : clientPopust >= 0 && clientPopust <= 100
        ? clientPopust
        : 0;
  const iznos = cena != null && f.brojCasova >= 0 ? Math.round(cena * f.brojCasova * (1 - popust / 100)) : null;
  return { cena, popust, clientPopust, iznos };
}

export default function UplataForm({
  instructors,
  clients,
  termTypes,
  fixedInstructorId,
  backHref = '/admin/uplate',
  initial,
}: {
  instructors: Option[];
  clients: ClientOption[];
  termTypes: TermTypeOption[];
  /** Kad je setovan (npr. za instruktora), instruktor je fiksiran i ne prikazuje se izbor. */
  fixedInstructorId?: string;
  /** Link za „Nazad” i redirect posle unosa (default admin uplate). */
  backHref?: string;
  /** Izmena postojeće uplate: polja kreću od sačuvanih vrednosti, a iznos se ne preračunava dok se nešto ne promeni. */
  initial?: UplataInitial;
}) {
  const router = useRouter();
  // Bez podrazumevanog izbora: uplata ne sme tiho da ode na prvog instruktora/dete sa liste.
  const [instructorId, setInstructorId] = useState(fixedInstructorId ?? initial?.instructorId ?? '');
  const effectiveInstructorId = fixedInstructorId ?? instructorId;
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const selectedClient = clients.find((c) => c.id === clientId);
  const [iznos, setIznos] = useState(initial?.iznos != null ? String(initial.iznos) : '');
  const [termTypeId, setTermTypeId] = useState(initial?.termTypeId ?? '');
  const [brojCasova, setBrojCasova] = useState(initial?.brojCasova ?? 1);
  const [popustPercent, setPopustPercent] = useState(initial?.popustPercent != null ? String(initial.popustPercent) : '');
  const [napomena, setNapomena] = useState(initial?.napomena ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const calc = izracunaj(termTypes, clients, { termTypeId, brojCasova, popustPercent, clientId });
  const cenaPoCasu = calc.cena;
  const clientPopust = calc.clientPopust;
  const effectivePopust = calc.popust;
  const iznosCalculated = calc.iznos;

  // Iznos se preračuna kad se promeni nešto što utiče na cenu (vrsta, broj časova, popust, klijent);
  // ručno uneti iznos ostaje dok se neko od tih polja ne promeni.
  const recalc = (patch: Partial<CalcInput>) => {
    const next = izracunaj(termTypes, clients, { termTypeId, brojCasova, popustPercent, clientId, ...patch });
    if (next.iznos != null && next.iznos >= 0) setIznos(String(next.iznos));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!effectiveInstructorId || !clientId) {
      setError('Izaberite predavača i klijenta.');
      return;
    }
    setLoading(true);
    const iznosNum = iznos.trim() ? parseFloat(iznos.replace(',', '.')) : null;
    if (iznos.trim() && (iznosNum === undefined || !Number.isFinite(iznosNum))) {
      setError('Iznos mora biti broj.');
      setLoading(false);
      return;
    }
    const popustNum = popustPercent.trim() ? parseFloat(popustPercent.replace(',', '.')) : null;
    const popustInvalid = popustPercent.trim() && (
      popustNum == null || !Number.isFinite(popustNum) || (Number(popustNum) < 0 || Number(popustNum) > 100)
    );
    if (popustInvalid) {
      setError('Popust mora biti broj 0–100.');
      setLoading(false);
      return;
    }
    const result = initial
      ? await updateUplata(
          initial.id,
          effectiveInstructorId,
          clientId,
          iznosNum,
          termTypeId || null,
          brojCasova,
          popustNum,
          napomena.trim() || null
        )
      : await createUplata(
          effectiveInstructorId,
          clientId,
          iznosNum,
          termTypeId || null,
          brojCasova,
          popustNum,
          napomena.trim() || null
        );
    setLoading(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success(initial ? 'Uplata izmenjena.' : 'Uplata uneta.');
    router.push(backHref);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {!fixedInstructorId && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Ko je primio (instruktor) *</label>
          <select
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          >
            <option value="">—</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>{i.ime} {i.prezime}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Klijent *</label>
        <SingleKlijentPicker
          clients={clients.map((c) => ({ id: c.id, ime: c.ime ?? '', prezime: c.prezime ?? '' }))}
          value={clientId}
          onChange={(id) => {
            setClientId(id);
            recalc({ clientId: id });
          }}
          disabled={loading}
          inputId="uplata-klijent-search"
        />
        {selectedClient != null && (
          <p className="mt-1 text-sm text-amber-700">
            Popust na nivou klijenta: <strong>{clientPopust}%</strong> (možete ga pregaziti poljem „Popust za ovu uplatu” ispod.)
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Vrsta časa</label>
        <select
          value={termTypeId}
          onChange={(e) => {
            setTermTypeId(e.target.value);
            recalc({ termTypeId: e.target.value });
          }}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          <option value="">—</option>
          {termTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.naziv}
              {t.cena_po_casu != null && Number(t.cena_po_casu) >= 0
                ? ` — ${Number(t.cena_po_casu).toLocaleString('sr-Latn-RS')} RSD/čas`
                : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Broj časova</label>
        <input
          type="number"
          min={0}
          value={brojCasova}
          onChange={(e) => {
            const n = Math.max(0, parseInt(e.target.value, 10) || 0);
            setBrojCasova(n);
            recalc({ brojCasova: n });
          }}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 max-w-[120px]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Popust za ovu uplatu (%)</label>
        <input
          type="text"
          value={popustPercent}
          onChange={(e) => {
            setPopustPercent(e.target.value);
            recalc({ popustPercent: e.target.value });
          }}
          placeholder={`npr. ${clientPopust > 0 ? clientPopust : '10'}`}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 max-w-[100px]"
        />
        <p className="mt-1 text-xs text-stone-500">0–100. Ako prazno, koristi se popust klijenta ({clientPopust}%).</p>
      </div>
      {iznosCalculated != null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <p className="text-xs font-medium text-amber-800 mb-0.5">Izračunata cena</p>
          <p className="text-lg font-semibold text-amber-900">
            {iznosCalculated.toLocaleString('sr-Latn-RS')} RSD
          </p>
          <p className="text-xs text-stone-600 mt-1">
            {cenaPoCasu != null && (
              <>
                {cenaPoCasu.toLocaleString('sr-Latn-RS')} × {brojCasova} časova
                {effectivePopust > 0 && (
                  <> − {effectivePopust}% popust</>
                )}
              </>
            )}
          </p>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Iznos (RSD)</label>
        <input
          type="text"
          value={iznos}
          onChange={(e) => setIznos(e.target.value)}
          placeholder={iznosCalculated != null ? String(iznosCalculated) : 'npr. 5000'}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
        <p className="mt-1 text-xs text-stone-500">Automatski popunjeno iz vrste časa, broja časova i popusta. Možete ručno izmeniti.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Napomena</label>
        <input
          type="text"
          value={napomena}
          onChange={(e) => setNapomena(e.target.value)}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? (initial ? 'Čuvam…' : 'Unos...') : initial ? 'Sačuvaj izmene' : 'Unesi uplatu'}
        </button>
        <Link href={backHref} className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100">
          Nazad
        </Link>
      </div>
    </form>
  );
}
