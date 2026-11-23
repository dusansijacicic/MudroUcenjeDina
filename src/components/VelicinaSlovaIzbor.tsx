'use client';

import { useState } from 'react';
import { VELICINA_SLOVA_COOKIE, VELICINE_SLOVA, type VelicinaSlova } from '@/lib/velicina-slova';

/** Pamti izbor za ovaj uređaj (kolačić, godinu dana) i odmah ga primenjuje na celu stranicu. */
function primeniVelicinu(kljuc: VelicinaSlova, skala: number) {
  document.cookie = `${VELICINA_SLOVA_COOKIE}=${kljuc}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.setAttribute('data-velicina', kljuc);
  document.documentElement.style.setProperty('--skala', String(skala));
}

/**
 * Izbor veličine slova za ovaj uređaj. Menja se odmah (bez ponovnog učitavanja), a pamti se u kolačiću,
 * pa važi na svim stranicama i posle zatvaranja pregledača.
 */
export default function VelicinaSlovaIzbor({ pocetna }: { pocetna: VelicinaSlova }) {
  const [izabrana, setIzabrana] = useState<VelicinaSlova>(pocetna);

  const izaberi = (kljuc: VelicinaSlova) => {
    const v = VELICINE_SLOVA.find((x) => x.kljuc === kljuc);
    if (!v) return;
    setIzabrana(kljuc);
    primeniVelicinu(kljuc, v.skala);
  };

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Veličina slova</legend>
      <div className="flex flex-wrap gap-2">
        {VELICINE_SLOVA.map((v) => {
          const aktivna = izabrana === v.kljuc;
          return (
            <label
              key={v.kljuc}
              htmlFor={`velicina-${v.kljuc}`}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${
                aktivna ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
              }`}
            >
              <input
                id={`velicina-${v.kljuc}`}
                type="radio"
                name="velicina-slova"
                className="sr-only"
                checked={aktivna}
                onChange={() => izaberi(v.kljuc)}
              />
              <span style={{ fontSize: `${v.skala}em` }} className="font-semibold leading-none">
                A
              </span>
              <span className="text-sm">{v.naziv}</span>
            </label>
          );
        })}
      </div>
      <p className="text-sm text-stone-500">
        Primer: <span className="font-medium text-stone-800">Vukašin Vasinovski</span> · 14:45 · Reedukacija. Važi za ovaj uređaj (telefon i
        računar mogu imati različito); menja se odmah, na svim stranicama.
      </p>
    </fieldset>
  );
}
