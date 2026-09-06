'use client';

import { useMemo, useState } from 'react';

export type SingleKlijentOption = {
  id: string;
  ime: string;
  prezime: string;
  /** Godište (opciono) – prikazuje se pored imena radi lakšeg razlikovanja istoimene dece. */
  godiste?: number | null;
  /** Datum testiranja (YYYY-MM-DD, opciono) – prikazuje se pored imena. */
  datumTestiranja?: string | null;
};

type Props = {
  clients: SingleKlijentOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  inputId?: string;
  /** Id-jevi klijenata koji su "završili" program vezan za trenutno izabranu vrstu časa – podrazumevano sakriveni. */
  completedIds?: Set<string>;
  /** Max-visina liste rezultata (Tailwind klasa) – podrazumevano max-h-52 (~4-5 redova); prosledi
   * kraću (npr. "max-h-20") kad picker stoji iznad nečeg drugog (npr. kalendara) kome treba prostor. */
  listMaxHeightClassName?: string;
};

function formatDatum(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('sr-Latn-RS');
}

function displayLabel(c: SingleKlijentOption): string {
  const extras: string[] = [];
  if (c.godiste != null) extras.push(`(${c.godiste})`);
  if (c.datumTestiranja) extras.push(formatDatum(c.datumTestiranja));
  return extras.length > 0 ? `${c.ime} ${c.prezime} ${extras.join(', ')}` : `${c.ime} ${c.prezime}`;
}

/** Pretraga + jednострuki izbor klijenta po imenu (sortira po imenu, a ne prezimenu). */
export default function SingleKlijentPicker({
  clients,
  value,
  onChange,
  disabled,
  inputId = 'single-klijent-search',
  completedIds,
  listMaxHeightClassName = 'max-h-52',
}: Props) {
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const sorted = useMemo(
    () =>
      [...clients].sort(
        (a, b) =>
          (a.ime ?? '').localeCompare(b.ime ?? '', 'sr') ||
          (a.prezime ?? '').localeCompare(b.prezime ?? '', 'sr')
      ),
    [clients]
  );

  const searchMatched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) => `${c.ime ?? ''} ${c.prezime ?? ''}`.toLowerCase().includes(q));
  }, [sorted, search]);

  const hiddenCompletedCount = useMemo(() => {
    if (!completedIds || completedIds.size === 0) return 0;
    return searchMatched.filter((c) => completedIds.has(c.id)).length;
  }, [searchMatched, completedIds]);

  const filtered = useMemo(() => {
    if (!completedIds || completedIds.size === 0 || showCompleted) return searchMatched;
    return searchMatched.filter((c) => !completedIds.has(c.id));
  }, [searchMatched, completedIds, showCompleted]);

  const selected = clients.find((c) => c.id === value);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border-2 border-stone-300 bg-white shadow-sm overflow-hidden ring-1 ring-stone-200/80">
        <div className="px-3 py-2.5 border-b border-stone-200 bg-gradient-to-b from-stone-50 to-stone-100/90">
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-stone-600 mb-1.5"
          >
            Pretraga klijenata
          </label>
          <input
            id={inputId}
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Kucaj ime…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
          />
          {!!completedIds && completedIds.size > 0 && (hiddenCompletedCount > 0 || showCompleted) && (
            <label className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded border-stone-300 text-amber-600"
              />
              Prikaži i završene {hiddenCompletedCount > 0 && !showCompleted ? `(${hiddenCompletedCount})` : ''}
            </label>
          )}
        </div>
        <div
          className={`${listMaxHeightClassName} overflow-y-auto overscroll-y-contain`}
          role="listbox"
          aria-label="Lista klijenata"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-5 text-sm text-stone-500 text-center">
              {clients.length === 0
                ? 'Nema klijenata na listi.'
                : 'Nema rezultata za ovu pretragu.'}
            </p>
          ) : (
            filtered.map((c) => {
              const isSelected = c.id === value;
              const isCompleted = completedIds?.has(c.id) ?? false;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onChange(isSelected ? '' : c.id)}
                  disabled={disabled}
                  role="option"
                  aria-selected={isSelected}
                  className={`w-full text-left px-4 py-2.5 text-sm border-b border-stone-100 last:border-b-0 transition-colors leading-snug antialiased ${
                    isSelected
                      ? 'bg-amber-50 text-amber-900 font-medium'
                      : 'hover:bg-stone-50 text-stone-900'
                  }`}
                >
                  {displayLabel(c)}
                  {isCompleted && (
                    <span className="ml-2 text-xs text-stone-400">(završeno)</span>
                  )}
                  {isSelected && (
                    <span className="ml-2 text-xs text-amber-700">✓</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <span className="text-sm font-medium text-stone-800">
            Izabrano: {displayLabel(selected)}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="ml-auto text-xs text-stone-500 hover:text-red-600"
              aria-label="Ukloni izbor"
            >
              Ukloni
            </button>
          )}
        </div>
      )}
    </div>
  );
}
