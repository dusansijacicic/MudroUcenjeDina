'use client';

import { useEffect } from 'react';

/**
 * Merenje brzine u pregledaču, za celu aplikaciju → Vercel Logs (pretraga „[merenje]“), preko /api/merenje.
 *
 *  - učitavanje: prvo otvaranje stranice (F5, link spolja) – dok se stranica ne pojavi, i koliko je od
 *    toga čekan server;
 *  - prelaz / osvežavanje: svaki prelaz na drugu stranicu unutar aplikacije i svako osvežavanje
 *    (router.refresh, posle operacija i automatsko) – od zahteva do kraja odgovora;
 *  - akcija: svaka operacija na serveru (Potvrdi, Sačuvaj, Obriši…) – sa tekstom dugmeta koje ju je
 *    pokrenulo.
 *
 * Ne menja ponašanje aplikacije: zahtevi idu isto kao i pre, samo se meri koliko traju. Prefetch
 * (unapred učitavanje linkova u pozadini) se ne meri.
 */

type Zapis = {
  vrsta: 'ucitavanje' | 'prelaz' | 'osvezavanje' | 'akcija';
  ms: number;
  putanja: string;
  dugme?: string;
  server?: number;
  prviOdgovor?: number;
  status?: number;
};

function posalji(z: Zapis) {
  try {
    const telo = JSON.stringify(z);
    if (navigator.sendBeacon?.('/api/merenje', new Blob([telo], { type: 'application/json' }))) return;
    void fetch('/api/merenje', { method: 'POST', body: telo, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
      () => {}
    );
  } catch {
    // merenje nikad ne sme da smeta aplikaciji
  }
}

/** Putanja sa upitom, bez Next-ovog internog parametra _rsc. */
function putanjaIz(href: string): string {
  try {
    const u = new URL(href, window.location.href);
    u.searchParams.delete('_rsc');
    const q = u.searchParams.toString();
    return u.pathname + (q ? `?${q}` : '');
  } catch {
    return '?';
  }
}

type Prozor = Window & { __merenjeBrzine?: boolean };

export default function MerenjeBrzine() {
  useEffect(() => {
    const w = window as Prozor;
    if (w.__merenjeBrzine) return;
    w.__merenjeBrzine = true;

    // Koje dugme/link je poslednje kliknuto – da se u logu vidi koja operacija je spora.
    let poslednji = { opis: '', t: 0 };
    const zapamti = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('button, a, input[type="submit"]');
      const opis = (el?.getAttribute('aria-label') || el?.textContent || (el as HTMLInputElement | null)?.value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
      poslednji = { opis, t: performance.now() };
    };
    const naTaster = (e: KeyboardEvent) => {
      if (e.key === 'Enter') zapamti(e);
    };
    document.addEventListener('pointerdown', zapamti, true);
    document.addEventListener('keydown', naTaster, true);

    // Prvo otvaranje stranice: Navigation Timing iz pregledača.
    const ucitavanje = () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!nav) return;
      posalji({
        vrsta: 'ucitavanje',
        ms: Math.round(nav.domContentLoadedEventEnd || nav.responseEnd),
        server: Math.round(nav.responseStart),
        putanja: putanjaIz(window.location.href),
        status: (nav as PerformanceNavigationTiming & { responseStatus?: number }).responseStatus,
      });
    };
    if (document.readyState === 'complete') ucitavanje();
    else window.addEventListener('load', () => setTimeout(ucitavanje, 0), { once: true });

    // Prelazi, osvežavanja i operacije idu kroz fetch (Next.js: zaglavlja RSC i Next-Action).
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let vrsta: Zapis['vrsta'] | null = null;
      let putanja = '';
      try {
        const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (h.has('next-action')) {
          vrsta = 'akcija';
          putanja = putanjaIz(window.location.href);
        } else if (h.get('rsc') === '1' && !h.has('next-router-prefetch') && !h.has('next-router-segment-prefetch')) {
          putanja = putanjaIz(href);
          vrsta = putanja === putanjaIz(window.location.href) ? 'osvezavanje' : 'prelaz';
        }
      } catch {
        vrsta = null;
      }
      if (!vrsta) return originalFetch(input, init);

      const t0 = performance.now();
      const dugme = t0 - poslednji.t < 5000 ? poslednji.opis : '';
      const odgovor = await originalFetch(input, init);
      const prviOdgovor = Math.round(performance.now() - t0);
      const zapisi = () =>
        posalji({ vrsta: vrsta as Zapis['vrsta'], ms: Math.round(performance.now() - t0), prviOdgovor, putanja, dugme, status: odgovor.status });
      try {
        // Kraj odgovora (Next ga čita u delovima) – meri se na kopiji, original ide aplikaciji netaknut.
        odgovor.clone().arrayBuffer().then(zapisi, zapisi);
      } catch {
        zapisi();
      }
      return odgovor;
    };

    return () => {
      // Ostaje uključeno dok je stranica otvorena (koreni layout se ne skida); ovo je samo za razvoj.
      document.removeEventListener('pointerdown', zapamti, true);
      document.removeEventListener('keydown', naTaster, true);
      window.fetch = originalFetch;
      w.__merenjeBrzine = false;
    };
  }, []);

  return null;
}
