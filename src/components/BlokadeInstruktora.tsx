'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { TIME_SLOTS } from '@/lib/constants';
import { danasBeograd } from '@/lib/datum';
import { blockSlotsAsAdmin, sacuvajNedeljneBlokadeAsAdmin, unblockSlotAsAdmin } from '@/app/admin/actions';
import { blokirajMojaVremena, sacuvajMojNedeljniRaspored, ukloniMojuBlokadu } from '@/app/dashboard/blokade/actions';

const DANI = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];
const kljuc = (dan: number, slot: number) => `${dan}|${slot}`;

type Blokada = { id: string; date: string; slot_index: number; napomena: string | null };

/**
 * „Kada ne radi“ za jednog instruktora: stalni nedeljni raspored (važi svake nedelje dok se ne promeni)
 * i blokade za konkretne datume. mode = 'admin' (admin uređuje izabranog instruktora) ili 'instruktor'
 * (predavač uređuje sebe – server uvek uzima ulogovanog predavača, instructorId se tada ne šalje).
 */
export default function BlokadeInstruktora({
  mode,
  instructorId,
  ime,
  nedeljne,
  blokade,
  migracijaPokrenuta,
}: {
  mode: 'admin' | 'instruktor';
  instructorId: string;
  ime: string;
  nedeljne: { dan: number; slot_index: number; napomena: string | null }[];
  blokade: Blokada[];
  migracijaPokrenuta: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const sacuvano = useMemo(() => new Set(nedeljne.map((n) => kljuc(n.dan, n.slot_index))), [nedeljne]);
  const [izbor, setIzbor] = useState<Set<string>>(() => new Set(sacuvano));
  const [razlogNedelja, setRazlogNedelja] = useState('');
  const izmenjeno = izbor.size !== sacuvano.size || [...izbor].some((k) => !sacuvano.has(k));

  const [danas] = useState(danasBeograd);
  const [datum, setDatum] = useState(() => danasBeograd());
  const [vremena, setVremena] = useState<Set<number>>(new Set());
  const [razlogDan, setRazlogDan] = useState('');

  const toggle = (dan: number, slot: number) =>
    setIzbor((prev) => {
      const next = new Set(prev);
      const k = kljuc(dan, slot);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const toggleDan = (dan: number) =>
    setIzbor((prev) => {
      const next = new Set(prev);
      const sve = TIME_SLOTS.every((_, s) => next.has(kljuc(dan, s)));
      TIME_SLOTS.forEach((_, s) => (sve ? next.delete(kljuc(dan, s)) : next.add(kljuc(dan, s))));
      return next;
    });

  const sacuvajNedelju = () =>
    startTransition(async () => {
      const polja = [...izbor].map((k) => {
        const [dan, slotIndex] = k.split('|').map(Number);
        return { dan, slotIndex };
      });
      const napomena = razlogNedelja.trim() || null;
      const res =
        mode === 'admin' ? await sacuvajNedeljneBlokadeAsAdmin(instructorId, polja, napomena) : await sacuvajMojNedeljniRaspored(polja, napomena);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Nedeljni raspored sačuvan – važi svake nedelje.');
      setRazlogNedelja('');
      router.refresh();
    });

  const blokirajDan = () =>
    startTransition(async () => {
      if (!datum || datum < danas) {
        toast.error('Izaberite današnji ili neki budući dan.');
        return;
      }
      const slots = [...vremena].sort((a, b) => a - b).map((slotIndex) => ({ date: datum, slotIndex }));
      const napomena = razlogDan.trim() || null;
      const res = mode === 'admin' ? await blockSlotsAsAdmin(slots, napomena, instructorId) : await blokirajMojaVremena(slots, napomena);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Blokirano ${slots.length} vremena za ${new Date(`${datum}T12:00:00`).toLocaleDateString('sr-Latn-RS')}.`);
      setVremena(new Set());
      setRazlogDan('');
      router.refresh();
    });

  const ukloni = (id: string) =>
    startTransition(async () => {
      const res = mode === 'admin' ? await unblockSlotAsAdmin(id) : await ukloniMojuBlokadu(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });

  const poDanu = useMemo(() => {
    const m = new Map<string, Blokada[]>();
    for (const b of [...blokade].sort((a, b) => a.date.localeCompare(b.date) || a.slot_index - b.slot_index)) {
      m.set(b.date, [...(m.get(b.date) ?? []), b]);
    }
    return [...m.entries()];
  }, [blokade]);

  if (!migracijaPokrenuta) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Blokade po instruktoru traže migraciju <code className="rounded bg-white px-1">048_blokade_po_instruktoru.sql</code> – pokrenite je u
        Supabase SQL Editoru, pa osvežite stranicu.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stalni nedeljni raspored */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-stone-800">Svake nedelje (stalno)</h3>
          <p className="text-sm text-stone-600">
            Kliknite vremena kada {mode === 'admin' ? `${ime} ne radi` : 'ne radite'} – važi svake nedelje dok se ne promeni. Klik na dan
            označi (ili skine) ceo dan. U tim vremenima {mode === 'admin' ? 'instruktor' : 'vi'} ne može dobiti čas.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full min-w-[520px] border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50">
                <th className="w-14 p-1.5" />
                {DANI.map((d, i) => (
                  <th key={d} className="p-1">
                    <button
                      type="button"
                      onClick={() => toggleDan(i + 1)}
                      className="w-full rounded-md px-1 py-1 font-semibold text-stone-700 hover:bg-stone-200"
                      title="Označi/skini ceo dan"
                    >
                      {d}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((t, slot) => (
                <tr key={t} className="border-t border-stone-100">
                  <td className="p-1 text-right font-medium tabular-nums text-stone-500">{t}</td>
                  {DANI.map((d, i) => {
                    const on = izbor.has(kljuc(i + 1, slot));
                    return (
                      <td key={d} className="p-0.5">
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`${d} ${t} – ${on ? 'ne radi' : 'radi'}`}
                          onClick={() => toggle(i + 1, slot)}
                          className={`h-7 w-full rounded-md border text-[11px] font-semibold transition-colors ${
                            on
                              ? 'border-stone-700 bg-stone-700 text-white'
                              : 'border-stone-200 bg-white text-transparent hover:border-stone-400 hover:bg-stone-100 hover:text-stone-400'
                          }`}
                        >
                          ✕
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 max-w-md text-sm">
            <span className="mb-1 block text-xs font-medium text-stone-700">Razlog (opciono, za nova vremena)</span>
            <input
              type="text"
              value={razlogNedelja}
              onChange={(e) => setRazlogNedelja(e.target.value)}
              placeholder="npr. drugi posao, fakultet…"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
            />
          </label>
          <button
            type="button"
            onClick={sacuvajNedelju}
            disabled={!izmenjeno || pending}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-40"
          >
            {pending ? 'Čuvam…' : 'Sačuvaj nedeljni raspored'}
          </button>
          {izmenjeno && (
            <button type="button" onClick={() => setIzbor(new Set(sacuvano))} className="text-sm text-stone-500 hover:text-stone-800">
              Poništi izmene
            </button>
          )}
          <span className="text-xs text-stone-500 tabular-nums">{izbor.size} vremena nedeljno</span>
        </div>
      </div>

      {/* Blokade za konkretne datume */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-stone-800">Pojedinačni dani</h3>
          <p className="text-sm text-stone-600">Za odmor, bolovanje ili jedan slobodan dan – važi samo tog datuma.</p>
        </div>
        <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-stone-700">Datum</span>
              <input
                type="date"
                min={danas}
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-800"
              />
            </label>
            <button
              type="button"
              onClick={() => setVremena((prev) => (prev.size === TIME_SLOTS.length ? new Set() : new Set(TIME_SLOTS.map((_, i) => i))))}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
            >
              {vremena.size === TIME_SLOTS.length ? 'Skini ceo dan' : 'Ceo dan'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TIME_SLOTS.map((t, i) => {
              const on = vremena.has(i);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setVremena((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className={`rounded-md border px-2 py-1 text-xs font-medium tabular-nums ${
                    on ? 'border-stone-700 bg-stone-700 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 max-w-md text-sm">
              <span className="mb-1 block text-xs font-medium text-stone-700">Razlog (opciono)</span>
              <input
                type="text"
                value={razlogDan}
                onChange={(e) => setRazlogDan(e.target.value)}
                placeholder="npr. odmor, lekar…"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-800"
              />
            </label>
            <button
              type="button"
              onClick={blokirajDan}
              disabled={vremena.size === 0 || pending}
              className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-40"
            >
              Blokiraj ({vremena.size})
            </button>
          </div>
        </div>

        {poDanu.length === 0 ? (
          <p className="text-sm text-stone-500">Nema blokada za predstojeće dane.</p>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
            {poDanu.map(([d, lista]) => (
              <li key={d} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="w-40 shrink-0 font-medium capitalize text-stone-800">
                  {new Date(`${d}T12:00:00`).toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
                {lista.map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1 rounded-md bg-stone-700 py-0.5 pl-2 pr-1 text-xs font-medium tabular-nums text-white" title={b.napomena ?? ''}>
                    {TIME_SLOTS[b.slot_index]}
                    <button
                      type="button"
                      onClick={() => ukloni(b.id)}
                      disabled={pending}
                      aria-label={`Ukloni blokadu ${TIME_SLOTS[b.slot_index]}`}
                      className="rounded px-1 text-stone-300 hover:bg-stone-600 hover:text-white"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {lista[0]?.napomena && <span className="text-xs text-stone-500">– {lista[0].napomena}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
