'use client';

export type PotentialClientDraft = {
  ime: string;
  prezime: string;
  imeRoditelja: string;
  mobilni: string;
  razred: string;
};

export function emptyPotentialClientDraft(): PotentialClientDraft {
  return { ime: '', prezime: '', imeRoditelja: '', mobilni: '', razred: '' };
}

/** Pretvara draft redove u payload za addPotentialClientsAsAdmin – prazni redovi (bez imena) se preskaču. */
export function draftsToPayload(rows: PotentialClientDraft[]) {
  return rows
    .filter((r) => r.ime.trim())
    .map((r) => ({
      ime: r.ime.trim(),
      prezime: r.prezime.trim() || null,
      ime_roditelja: r.imeRoditelja.trim() || null,
      mobilni_roditelja: r.mobilni.trim() || null,
      razred: r.razred.trim() || null,
    }));
}

/** Ponavljajuća polja za unos jednog ili više potencijalnih klijenata (dece za testiranje) –
 * deljeno između forme za zakazivanje termina i stranice postojećeg termina. */
export default function PotentialClientRowsInput({
  rows,
  onChange,
  disabled = false,
}: {
  rows: PotentialClientDraft[];
  onChange: (rows: PotentialClientDraft[]) => void;
  disabled?: boolean;
}) {
  const updateRow = (idx: number, patch: Partial<PotentialClientDraft>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => (
        <div key={idx} className="rounded-lg border border-stone-200 bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-stone-500">Dete {idx + 1}</p>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                disabled={disabled}
                className="text-xs text-red-600 hover:underline"
              >
                Ukloni
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Ime *"
              value={row.ime}
              onChange={(e) => updateRow(idx, { ime: e.target.value })}
              disabled={disabled}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
            />
            <input
              type="text"
              placeholder="Prezime"
              value={row.prezime}
              onChange={(e) => updateRow(idx, { prezime: e.target.value })}
              disabled={disabled}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
            />
            <input
              type="text"
              placeholder="Ime roditelja"
              value={row.imeRoditelja}
              onChange={(e) => updateRow(idx, { imeRoditelja: e.target.value })}
              disabled={disabled}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
            />
            <input
              type="text"
              placeholder="Mobilni roditelja"
              value={row.mobilni}
              onChange={(e) => updateRow(idx, { mobilni: e.target.value })}
              disabled={disabled}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
            />
            <input
              type="text"
              placeholder="Razred"
              value={row.razred}
              onChange={(e) => updateRow(idx, { razred: e.target.value })}
              disabled={disabled}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, emptyPotentialClientDraft()])}
        disabled={disabled}
        className="text-sm text-amber-700 hover:underline"
      >
        + Dodaj još jedno dete
      </button>
    </div>
  );
}
