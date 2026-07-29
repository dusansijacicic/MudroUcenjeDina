'use client';

import { useMemo, useState } from 'react';

export type GrupniKlijentOption = {
  id: string;
  ime: string;
  prezime: string;
  /** Godište (opciono) – prikazuje se pored imena radi lakšeg razlikovanja istoimene dece. */
  godiste?: number | null;
  /** Datum testiranja (YYYY-MM-DD, opciono) – prikazuje se pored imena. */
  datumTestiranja?: string | null;
};

type Props = {
  clients: GrupniKlijentOption[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Za jedinstven id polja pretrage ako ima više picker-a na stranici */
  inputId?: string;
  /** Id-jevi klijenata koji su "završili" program vezan za trenutno izabranu vrstu časa – podrazumevano sakriveni. */
  completedIds?: Set<string>;
};

function formatDatum(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('sr-Latn-RS');
}

/** Višestruki izbor klijenata za grupni termin: pretraga + lista sa checkboxovima. */
export default function GrupniKlijentiPicker({
  clients,
  selectedIds,
  onSelectionChange,
  disabled,
  inputId = 'grupni-klijenti-search',
  completedIds,
}: Props) {
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const searchMatched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const full = `${c.ime ?? ''} ${c.prezime ?? ''}`.toLowerCase();
      return full.includes(q);
    });
  }, [clients, search]);

  const hiddenCompletedCount = useMemo(() => {
    if (!completedIds || completedIds.size === 0) return 0;
    // Ne broji već označene – oni ostaju vidljivi bez obzira na "završeno" da se ne bi izgubili iz izbora.
    return searchMatched.filter((c) => completedIds.has(c.id) && !selectedIds.includes(c.id)).length;
  }, [searchMatched, completedIds, selectedIds]);

  const filtered = useMemo(() => {
    if (!completedIds || completedIds.size === 0 || showCompleted) return searchMatched;
    return searchMatched.filter((c) => !completedIds.has(c.id) || selectedIds.includes(c.id));
  }, [searchMatched, completedIds, showCompleted, selectedIds]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const selectAllFiltered = () => {
    const ids = new Set(selectedIds);
    filtered.forEach((c) => ids.add(c.id));
    onSelectionChange([...ids]);
  };

  const clearFiltered = () => {
    const filteredSet = new Set(filtered.map((c) => c.id));
    onSelectionChange(selectedIds.filter((id) => !filteredSet.has(id)));
  };

  const selectedClients = useMemo(
    () => selectedIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean) as GrupniKlijentOption[],
    [clients, selectedIds]
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-stone-300 bg-white shadow-sm overflow-hidden ring-1 ring-stone-200/80">
        <div className="px-3 py-2.5 border-b border-stone-200 bg-gradient-to-b from-stone-50 to-stone-100/90">
          <label htmlFor={inputId} className="block text-xs font-medium text-stone-600 mb-1.5">
            Pretraga klijenata
          </label>
          <input
            id={inputId}
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Kucaj ime ili prezime…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={disabled}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
          />
          {filtered.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                disabled={disabled}
                onClick={selectAllFiltered}
                className="text-xs font-medium text-amber-800 hover:text-amber-950 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Označ sve u listi
              </button>
              <span className="text-stone-300">·</span>
              <button
                type="button"
                disabled={disabled}
                onClick={clearFiltered}
                className="text-xs font-medium text-stone-600 hover:text-stone-900 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Skini oznaku sa liste
              </button>
            </div>
          )}
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
          className="max-h-56 overflow-y-auto overscroll-y-contain"
          role="listbox"
          aria-label="Lista klijenata za grupni termin"
          aria-multiselectable="true"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-stone-500 text-center leading-relaxed">
              {clients.length === 0
                ? 'Nema klijenata na listi.'
                : 'Nema rezultata za ovu pretragu.'}
            </p>
          ) : (
            filtered.map((c) => {
              const checked = selectedIds.includes(c.id);
              const isCompleted = completedIds?.has(c.id) ?? false;
              return (
                <label
                  key={c.id}
                  className={`flex gap-3 px-3 py-3 cursor-pointer border-b border-stone-100 last:border-b-0 transition-colors ${
                    checked ? 'bg-amber-50/90' : 'hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.id)}
                    disabled={disabled}
                    className="mt-0.5 shrink-0 h-4 w-4 rounded border-stone-400 text-amber-600 focus:ring-amber-500 focus:ring-offset-0"
                  />
                  <span className="flex-1 min-w-0 text-base text-stone-900 font-normal leading-snug tracking-normal antialiased select-text break-words">
                    {fullName(c)}
                    {isCompleted && <span className="ml-2 text-xs text-stone-400">(završeno)</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {selectedClients.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
          <p className="text-xs font-semibold text-stone-700 mb-1.5">Izabrano ({selectedClients.length})</p>
          <ul className="space-y-1 text-sm text-stone-900 leading-relaxed">
            {selectedClients.map((c) => (
              <li key={c.id} className="pl-0 break-words antialiased">
                • {fullName(c)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function fullName(c: GrupniKlijentOption): string {
  const i = (c.ime ?? '').trim();
  const p = (c.prezime ?? '').trim();
  const name = [i, p].filter(Boolean).join(' ') || '—';
  const extras: string[] = [];
  if (c.godiste != null) extras.push(`(${c.godiste})`);
  if (c.datumTestiranja) extras.push(formatDatum(c.datumTestiranja));
  return extras.length > 0 ? `${name} ${extras.join(', ')}` : name;
}
