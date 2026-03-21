'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  createPredavanje,
  createPredavanjaBatch,
  updatePredavanje,
  deletePredavanje,
  updateTermClassroom,
  updateTermMetaAsInstructor,
} from '@/app/dashboard/termin/actions';
import type { Predavanje } from '@/types/database';
import type { TermCategoryRow } from '@/lib/term-categories';
import GrupniKlijentiPicker from '@/components/GrupniKlijentiPicker';

type ClientOption = { id: string; ime: string; prezime: string };
type TermTypeOption = { id: string; naziv: string; opis: string | null };
type ClassroomOption = { id: string; naziv: string; color: string | null };
type StanjeItem = { term_type_id: string | null; term_type_naziv: string; uplaceno: number; odrzano: number; ostalo: number };

interface PredavanjeFormProps {
  termId: string;
  termDate: string;
  slotLabel: string;
  clients: ClientOption[];
  predavanje?: (Predavanje & { term_type_id?: string | null }) | null;
  termTypes?: TermTypeOption[];
  maxCasova?: number;
  currentCount?: number;
  classrooms?: ClassroomOption[];
  initialClassroomId?: string | null;
  takenClassroomIds?: string[];
  clientStanjeList?: { clientId: string; stanje: StanjeItem[] }[];
  termCategories: TermCategoryRow[];
  /** Sa servera: terms.term_category_id */
  initialTermCategoryId: string;
  /** Sa servera (kolona terms.napomena) */
  initialTermNapomena?: string | null;
}

export default function PredavanjeForm({
  termId,
  termDate,
  slotLabel,
  clients,
  predavanje,
  termTypes = [],
  maxCasova = 4,
  currentCount = 0,
  classrooms = [],
  initialClassroomId = null,
  takenClassroomIds = [],
  clientStanjeList = [],
  termCategories,
  initialTermCategoryId,
  initialTermNapomena = null,
}: PredavanjeFormProps) {
  const availableClassrooms = classrooms.filter(
    (c) => !takenClassroomIds.includes(c.id) || c.id === (initialClassroomId ?? '')
  );
  const router = useRouter();
  const [clientId, setClientId] = useState(predavanje?.client_id ?? '');
  const selectedStanje = clientStanjeList.find((s) => s.clientId === clientId)?.stanje ?? [];
  const [termTypeId, setTermTypeId] = useState<string>(predavanje?.term_type_id ?? '');
  const [odrzano, setOdrzano] = useState(predavanje?.odrzano ?? false);
  const [placeno, setPlaceno] = useState(predavanje?.placeno ?? false);
  const [komentar, setKomentar] = useState(predavanje?.komentar ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classroomId, setClassroomId] = useState<string>(initialClassroomId ?? '');

  const [termCategoryId, setTermCategoryId] = useState(() => {
    if (initialTermCategoryId && termCategories.some((c) => c.id === initialTermCategoryId)) {
      return initialTermCategoryId;
    }
    return termCategories[0]?.id ?? '';
  });
  const [termNapomena, setTermNapomena] = useState(initialTermNapomena ?? '');
  const [grupniSelected, setGrupniSelected] = useState<string[]>([]);

  const selectedCategory = termCategories.find((c) => c.id === termCategoryId);
  const allowsMultipleClients = selectedCategory ? !selectedCategory.jedan_klijent_po_terminu : false;

  const isNew = !predavanje;
  const effectiveMax = allowsMultipleClients ? maxCasova : 1;
  const atLimit = isNew && currentCount >= effectiveMax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (atLimit) return;
    if (termCategories.length === 0) {
      setError('Nema kategorija termina. Admin mora dodati kategorije u Admin → Kategorije termina.');
      return;
    }
    if (!termCategoryId) {
      setError('Izaberite kategoriju termina.');
      return;
    }
    if (termTypes.length === 0) {
      setError('Prvo dodajte bar jednu vrstu termina (Admin → Vrste termina).');
      return;
    }
    if (!termTypeId) {
      setError('Izaberite vrstu termina.');
      return;
    }
    setLoading(true);
    try {
      const metaRes = await updateTermMetaAsInstructor(termId, {
        term_category_id: termCategoryId,
        napomena: termNapomena.trim() || null,
      });
      if (metaRes.error) throw new Error(metaRes.error);

      if (classrooms.length > 0 && availableClassrooms.length === 0) {
        throw new Error('Nema slobodnih učionica u ovom terminu (sve su zauzete). Kontaktirajte admina.');
      }
      if (classrooms.length > 0 && !classroomId) {
        throw new Error('Izaberite učionicu za ovaj termin.');
      }
      if (classrooms.length > 0 && classroomId) {
        const res = await updateTermClassroom(termId, classroomId);
        if (res.error) throw new Error(res.error);
      }

      if (predavanje) {
        const result = await updatePredavanje(
          predavanje.id,
          termId,
          clientId,
          odrzano,
          placeno,
          komentar.trim() || null,
          termTypeId || null
        );
        if (result.error) throw new Error(result.error);
        toast.success('Radionica sačuvana.');
      } else {
        if (allowsMultipleClients) {
          if (grupniSelected.length === 0) {
            throw new Error('Za grupni termin označite bar jedno dete.');
          }
          const batchRes = await createPredavanjaBatch(termId, grupniSelected, termTypeId || null, komentar.trim() || null);
          if (batchRes.error) throw new Error(batchRes.error);
          toast.success(
            grupniSelected.length === 1 ? 'Radionica dodata.' : `Dodato ${grupniSelected.length} radionica.`
          );
        } else {
          if (!clientId) throw new Error('Izaberite klijenta.');
          const result = await createPredavanje(
            termId,
            clientId,
            odrzano,
            placeno,
            komentar.trim() || null,
            termTypeId || null
          );
          if (result.error) throw new Error(result.error);
          toast.success('Radionica dodata.');
        }
      }
      const getMonday = (d: Date) => {
        const x = new Date(d);
        const dow = x.getDay();
        x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
        return x.toISOString().slice(0, 10);
      };
      const weekStart = getMonday(new Date(termDate + 'T12:00:00'));
      router.push(`/dashboard?week=${weekStart}`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Greška pri čuvanju.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!predavanje || !confirm('Obrisati ovu radionicu?')) return;
    setLoading(true);
    try {
      const result = await deletePredavanje(predavanje.id, termId);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Radionica obrisana.');
      router.push(`/dashboard/termin/${termId}`);
      router.refresh();
    } catch {
      setError('Greška pri brisanju.');
      toast.error('Greška pri brisanju.');
    } finally {
      setLoading(false);
    }
  };

  const limitHint = useMemo(
    () =>
      allowsMultipleClients
        ? `Grupa: do ${maxCasova} radionica (dece) u istom terminu.`
        : 'U ovoj kategoriji u terminu je dozvoljena samo jedna radionica (jedno dete).',
    [allowsMultipleClients, maxCasova]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-sm text-stone-500">
        {termDate} • {slotLabel}
        {isNew && (
          <span className="ml-2 text-stone-400">
            ({currentCount} / {effectiveMax} radionica)
          </span>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          1. Vrsta termina (tip časa, cena) <span className="text-red-600">*</span>
        </label>
        <select
          value={termTypeId}
          onChange={(e) => setTermTypeId(e.target.value)}
          required
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
        >
          <option value="">Izaberite vrstu termina</option>
          {termTypes.map((tt) => (
            <option key={tt.id} value={tt.id}>
              {tt.naziv}
            </option>
          ))}
        </select>
        {termTypes.length === 0 && (
          <p className="text-xs text-amber-600 mt-0.5">Admin mora dodati bar jednu vrstu u Admin → Vrste termina.</p>
        )}
        <p className="text-xs text-stone-500 mt-1.5">
          Prvo vrsta časa; ista vrsta za sva deca u grupnom terminu. Zatim kategoriju (grupni / individualni).
        </p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-stone-800">2. Kategorija termina</h3>
        <p className="text-xs text-stone-600">{limitHint}</p>
        <div>
          <label className="block text-xs font-medium text-stone-700 mb-1">Kategorija</label>
          <select
            value={termCategoryId}
            onChange={(e) => setTermCategoryId(e.target.value)}
            className="w-full max-w-md rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white"
            required
          >
            {termCategories.length === 0 ? (
              <option value="">—</option>
            ) : (
              termCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.naziv}
                  {c.jedan_klijent_po_terminu ? ' (jedno dete)' : ' (grupa)'}
                </option>
              ))
            )}
          </select>
          <p className="text-xs text-stone-500 mt-1">
            Kategorije definiše admin (Admin → Kategorije termina).
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-700 mb-1">Napomena za termin (opciono)</label>
          <p className="text-xs text-stone-500 mb-1">Možete je menjati i vi i admin; vidljiva je na stranici termina.</p>
          <textarea
            value={termNapomena}
            onChange={(e) => setTermNapomena(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
            placeholder="Interna napomena za ovaj termin..."
          />
        </div>
      </div>

      {atLimit && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          {!allowsMultipleClients
            ? 'Ova kategorija dozvoljava samo jedno dete u terminu. Za drugo dete u istom vremenu izaberite kategoriju za grupu ili drugi slot.'
            : `Maksimalan broj radionica u ovom terminu je ${maxCasova}. Podešavanje može da menja superadmin u Admin → Podešavanja.`}
        </p>
      )}

      {isNew && allowsMultipleClients ? (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">3. Deca u grupnom terminu</label>
          <p className="text-xs text-stone-500 mb-3">
            Pretražite listu i označite checkboxom (isti tip časa i cena = vrsta termina ispod).
          </p>
          <GrupniKlijentiPicker
            clients={clients}
            selectedIds={grupniSelected}
            onSelectionChange={setGrupniSelected}
            disabled={loading}
            inputId="dashboard-predavanje-grupni-search"
          />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            {isNew ? '3. Klijent' : 'Klijent'}
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required={!predavanje}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          >
            <option value="">Izaberite klijenta</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ime} {c.prezime}
              </option>
            ))}
          </select>
          {clientId && selectedStanje.length > 0 && (
            <div className="mt-2 rounded-lg bg-stone-50 border border-stone-200 px-3 py-2 text-sm">
              <span className="font-medium text-stone-600">Ostalo časova kod vas: </span>
              {selectedStanje.map((s) => (
                <span key={s.term_type_id ?? 'bez'} className="mr-2">
                  {s.term_type_naziv} <strong className="text-amber-800">{s.ostalo}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {classrooms.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Učionica</label>
          <select
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            required
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 bg-white"
          >
            <option value="">Izaberite učionicu</option>
            {availableClassrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.naziv}
              </option>
            ))}
          </select>
          {availableClassrooms.length === 0 && (
            <p className="text-xs text-amber-700 mt-1">Sve učionice su zauzete u ovom terminu.</p>
          )}
        </div>
      )}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={odrzano}
            onChange={(e) => setOdrzano(e.target.checked)}
            className="rounded border-stone-300 text-amber-600"
          />
          <span className="text-sm text-stone-700">Održano</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={placeno}
            onChange={(e) => setPlaceno(e.target.checked)}
            className="rounded border-stone-300 text-amber-600"
          />
          <span className="text-sm text-stone-700">Plaćeno</span>
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Komentar (šta je rađeno)</label>
        <textarea
          value={komentar}
          onChange={(e) => setKomentar(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
          placeholder="Opis rada na času..."
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || atLimit}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? 'Čuvanje...' : predavanje ? 'Sačuvaj' : 'Dodaj radionicu'}
        </button>
        <Link
          href={`/dashboard/termin/${termId}`}
          className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
        >
          Odustani
        </Link>
        {predavanje && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="ml-auto rounded-lg border border-red-200 text-red-600 px-4 py-2 hover:bg-red-50"
          >
            Obriši
          </button>
        )}
      </div>
    </form>
  );
}
