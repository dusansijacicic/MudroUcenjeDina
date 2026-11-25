'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ZUM_COOKIE, ZUM_KORAK, ZUM_MAX, ZUM_MIN, zaokruziZum } from '@/lib/kalendar-zum';

type Tacka = { x: number; y: number };

function zapamtiZum(z: number) {
  document.cookie = `${ZUM_COOKIE}=${z}; path=/; max-age=31536000; samesite=lax`;
}

/** Vidljiv okvir sa horizontalnim skrolom (tabela) – npr. na telefonu je desktop tabela sakrivena. */
function skrolOkvir(el: HTMLElement): HTMLElement | null {
  for (const s of el.querySelectorAll<HTMLElement>('[data-zum-skrol]')) {
    if (s.getClientRects().length > 0) return s;
  }
  return null;
}

/** Sredina dela kalendara koji se vidi na ekranu – oko nje se zumira dugmićima. */
function sredinaVidljivog(el: HTMLElement): Tacka {
  const r = el.getBoundingClientRect();
  const gore = Math.max(r.top, 0);
  const dole = Math.min(r.bottom, window.innerHeight);
  const levo = Math.max(r.left, 0);
  const desno = Math.min(r.right, window.innerWidth);
  return { x: (levo + desno) / 2, y: dole > gore ? (gore + dole) / 2 : r.top };
}

/**
 * Postavlja CSS zoom i drži isti deo kalendara ispod tačke `fokus` (prsti / sredina ekrana): vertikalno
 * pomera stranu, horizontalno okvir sa skrolom. Sve se meri u odnosu (udeo), pa ne zavisi od toga kako
 * pregledač računa jedinice unutar zumiranog dela.
 */
function primeniZum(el: HTMLElement, z: number, fokus: Tacka | null) {
  const skrol = skrolOkvir(el);
  let fy: number | null = null;
  let fx: number | null = null;
  if (fokus) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) fy = Math.min(1, Math.max(0, (fokus.y - r.top) / r.height));
    if (skrol && skrol.scrollWidth > skrol.clientWidth) {
      const s = skrol.getBoundingClientRect();
      const k = s.width > 0 ? skrol.clientWidth / s.width : 1;
      fx = (skrol.scrollLeft + (fokus.x - s.left) * k) / skrol.scrollWidth;
    }
  }
  el.style.zoom = String(z);
  el.style.setProperty('--zum', String(z));
  el.dataset.zum = String(z);
  // Zamrznuto zaglavlje tabele (useStickyThead) se preračunava za novi zum.
  window.dispatchEvent(new Event('kalendar-zum'));
  if (fokus && fy !== null) {
    const r = el.getBoundingClientRect();
    const pomak = r.top + fy * r.height - fokus.y;
    if (Math.abs(pomak) > 1) window.scrollBy(0, pomak);
  }
  if (fokus && skrol && fx !== null) {
    const s = skrol.getBoundingClientRect();
    const k = s.width > 0 ? skrol.clientWidth / s.width : 1;
    skrol.scrollLeft = fx * skrol.scrollWidth - (fokus.x - s.left) * k;
  }
}

/**
 * Kalendar koji može da se umanji/uveća: dugmići −/+ (klik na procenat = 100%) i štipanje sa dva prsta
 * na telefonu/tabletu. Manji prikaz = više dana i vremena na ekranu odjednom. Pamti se po uređaju.
 * `traka` = ostali dugmići u istom redu (npr. „Nedelju nazad/napred“) – oni se ne zumiraju.
 */
export default function ZumKalendara({
  pocetni = 1,
  traka,
  children,
}: {
  pocetni?: number;
  traka?: ReactNode;
  children: ReactNode;
}) {
  const [zum, setZum] = useState(() => zaokruziZum(pocetni));
  // Procenat dok traje štipanje (pre nego što se zum upiše).
  const [uToku, setUToku] = useState<number | null>(null);
  const okvirRef = useRef<HTMLDivElement>(null);
  const zumRef = useRef(zum);
  useEffect(() => {
    zumRef.current = zum;
  }, [zum]);

  const postavi = (z: number, fokus: Tacka | null) => {
    const el = okvirRef.current;
    const n = zaokruziZum(z);
    if (el) primeniZum(el, n, fokus ?? sredinaVidljivog(el));
    zumRef.current = n;
    setZum(n);
    zapamtiZum(n);
  };

  // Štipanje sa dva prsta: dok traje – brz pregled (transform: scale, bez preračunavanja tabele);
  // kad se prsti podignu – pravi zum, a deo ispod prstiju ostaje na mestu.
  useEffect(() => {
    const el = okvirRef.current;
    if (!el) return;
    let pocetak: { razmak: number; zum: number; fokus: Tacka } | null = null;
    let trenutni = zumRef.current;
    let frame = 0;
    const razmak = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const naPocetak = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const r = razmak(e.touches);
      if (r < 10) return;
      const fokus = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
      const okvir = el.getBoundingClientRect();
      if (okvir.width > 0 && okvir.height > 0) {
        el.style.transformOrigin = `${((fokus.x - okvir.left) / okvir.width) * 100}% ${((fokus.y - okvir.top) / okvir.height) * 100}%`;
      }
      pocetak = { razmak: r, zum: zumRef.current, fokus };
      trenutni = zumRef.current;
    };
    const naPomeraj = (e: TouchEvent) => {
      if (!pocetak || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const z = Math.min(ZUM_MAX, Math.max(ZUM_MIN, pocetak.zum * (razmak(e.touches) / pocetak.razmak)));
      if (Math.abs(z - trenutni) < 0.005) return;
      trenutni = z;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!pocetak) return;
          el.style.transform = `scale(${trenutni / pocetak.zum})`;
          setUToku(trenutni);
        });
      }
    };
    const naKraj = (e: TouchEvent) => {
      if (!pocetak || e.touches.length >= 2) return;
      const { fokus } = pocetak;
      pocetak = null;
      cancelAnimationFrame(frame);
      frame = 0;
      el.style.transform = '';
      el.style.transformOrigin = '';
      const n = zaokruziZum(trenutni);
      primeniZum(el, n, fokus);
      zumRef.current = n;
      setZum(n);
      setUToku(null);
      zapamtiZum(n);
    };
    // Safari (iPad/iPhone): da se ne zumira cela strana umesto kalendara.
    const bezZumaStrane = (e: Event) => e.preventDefault();

    el.addEventListener('touchstart', naPocetak, { passive: true });
    el.addEventListener('touchmove', naPomeraj, { passive: false });
    el.addEventListener('touchend', naKraj);
    el.addEventListener('touchcancel', naKraj);
    el.addEventListener('gesturestart', bezZumaStrane);
    el.addEventListener('gesturechange', bezZumaStrane);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('touchstart', naPocetak);
      el.removeEventListener('touchmove', naPomeraj);
      el.removeEventListener('touchend', naKraj);
      el.removeEventListener('touchcancel', naKraj);
      el.removeEventListener('gesturestart', bezZumaStrane);
      el.removeEventListener('gesturechange', bezZumaStrane);
    };
  }, []);

  const procenat = Math.round((uToku ?? zum) * 100);
  const dugme =
    'flex h-9 w-9 items-center justify-center rounded-md text-lg font-bold leading-none text-stone-700 hover:bg-white disabled:opacity-40 md:h-7 md:w-7';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {traka}
        <div
          role="group"
          aria-label="Veličina prikaza kalendara"
          title="Manji prikaz = više termina na ekranu. Na telefonu/tabletu radi i štipanje sa dva prsta."
          className="flex items-center gap-0.5 rounded-lg bg-stone-100 p-0.5 text-sm text-stone-700"
        >
          <span aria-hidden className="pl-1.5 pr-0.5 text-xs text-stone-500">
            🔍
          </span>
          <button
            type="button"
            aria-label="Umanji prikaz (više termina na ekranu)"
            disabled={zum <= ZUM_MIN}
            onClick={() => postavi(zum - ZUM_KORAK, null)}
            className={dugme}
          >
            −
          </button>
          <button
            type="button"
            aria-label={`Prikaz ${procenat}% – klik vraća na 100%`}
            onClick={() => postavi(1, null)}
            className="min-w-[3.25rem] rounded-md px-1 py-1 text-center text-xs font-semibold tabular-nums hover:bg-white"
          >
            {procenat}%
          </button>
          <button
            type="button"
            aria-label="Uvećaj prikaz"
            disabled={zum >= ZUM_MAX}
            onClick={() => postavi(zum + ZUM_KORAK, null)}
            className={dugme}
          >
            +
          </button>
        </div>
      </div>
      <div
        ref={okvirRef}
        data-zum={zum}
        // pan-x pan-y: pregledač i dalje skroluje prstom, ali štipanje ovde zumira kalendar, ne celu stranu.
        style={{ zoom: zum, touchAction: 'pan-x pan-y', '--zum': zum } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
