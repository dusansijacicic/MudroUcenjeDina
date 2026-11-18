/**
 * Merenje brzine – vidi se u Vercel → projekat → Logs (u pretragu upišite „[merenje]“).
 *
 *  - Svaki poziv ka Supabase-u (upit, RPC, auth) sa servera koji traje ≥ MERENJE_PRAG_MS (podrazumevano
 *    150 ms) upiše se kao:  [merenje] sporo 420ms POST rest:rpc/redni_broj_casova
 *    Važi za sve stranice i sve operacije (server actions), jer ide kroz zajednički fetch klijenata.
 *    Upisuje se samo putanja (tabela/funkcija), bez parametara i podataka.
 *  - Stranica koja koristi merenje(naziv) upiše jedan red sa ukupnim vremenom i svakim korakom,
 *    najsporiji prvi:  [merenje] kalendar 812ms | redni 430 · terms 210 · …
 *
 * MERENJE=0 u env promenljivama (Vercel → Settings → Environment Variables) isključuje sve.
 */

const UKLJUCENO = process.env.MERENJE !== '0';
const PRAG_MS = Number(process.env.MERENJE_PRAG_MS) || 150;
/** Iznad ovoga red stranice dobija oznaku SPORO (cilj: sve ispod pola sekunde). */
const CILJ_MS = 500;

function opisZahteva(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  try {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // "/rest/v1/terms" → "rest:terms", "/rest/v1/rpc/x" → "rest:rpc/x", "/auth/v1/user" → "auth:user"
    return `${method} ${new URL(href).pathname.replace(/^\/(rest|auth|storage|realtime)\/v1\//, '$1:')}`;
  } catch {
    return `${method} ?`;
  }
}

/** fetch za Supabase klijente na serveru – meri svaki poziv i upiše spore. */
export const merenaFetch: typeof fetch = async (input, init) => {
  if (!UKLJUCENO) return fetch(input, init);
  const t0 = performance.now();
  try {
    return await fetch(input, init);
  } finally {
    const ms = Math.round(performance.now() - t0);
    if (ms >= PRAG_MS) console.log(`[merenje] sporo ${ms}ms ${opisZahteva(input, init)}`);
  }
};

export type Merenje = {
  /** Meri jedan korak (upit ili bilo šta što se čeka) i vraća njegov rezultat nepromenjen. */
  meri<T>(korak: string, posao: PromiseLike<T>): Promise<T>;
  /** Upiše red sa ukupnim vremenom od merenje(naziv) do sada i svim izmerenim koracima. */
  kraj(dodatak?: string): void;
};

/** Merenje jedne stranice ili operacije. */
export function merenje(naziv: string): Merenje {
  const t0 = performance.now();
  const koraci: [string, number][] = [];
  return {
    async meri<T>(korak: string, posao: PromiseLike<T>): Promise<T> {
      const s = performance.now();
      try {
        return await posao;
      } finally {
        koraci.push([korak, Math.round(performance.now() - s)]);
      }
    },
    kraj(dodatak?: string) {
      if (!UKLJUCENO) return;
      const ukupno = Math.round(performance.now() - t0);
      const detalji = [...koraci]
        .sort((a, b) => b[1] - a[1])
        .map(([k, ms]) => `${k} ${ms}`)
        .join(' · ');
      console.log(
        `[merenje] ${naziv} ${ukupno}ms${ukupno > CILJ_MS ? ' SPORO' : ''}${dodatak ? ` (${dodatak})` : ''}${detalji ? ` | ${detalji}` : ''}`
      );
    },
  };
}
