/**
 * Veličina slova – bira se u Podešavanjima i pamti u kolačiću, posebno za svaki uređaj (telefon i
 * računar mogu imati različito). Koreni layout je postavlja na <html> (data-velicina + --skala):
 * relativne veličine (rem) rastu same, a fiksne veličine u pikselima (kalendar) preko globals.css.
 */
export const VELICINA_SLOVA_COOKIE = 'velicina_slova';

export const VELICINE_SLOVA = [
  { kljuc: 'manja', naziv: 'Manja', skala: 0.9 },
  { kljuc: 'normalna', naziv: 'Normalna', skala: 1 },
  { kljuc: 'veca', naziv: 'Veća', skala: 1.12 },
  { kljuc: 'najveca', naziv: 'Najveća', skala: 1.25 },
] as const;

export type VelicinaSlova = (typeof VELICINE_SLOVA)[number]['kljuc'];

export function velicinaSlova(v: string | undefined | null): (typeof VELICINE_SLOVA)[number] {
  return VELICINE_SLOVA.find((x) => x.kljuc === v) ?? VELICINE_SLOVA[1];
}
