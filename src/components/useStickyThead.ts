'use client';

import { useEffect, useRef } from 'react';

/**
 * "Zamrznuto" zaglavlje tabele (thead, npr. dani i datumi u kalendaru): dok se stranica skroluje, zaglavlje
 * ostaje na vrhu ekrana, odmah ispod zamrznute trake alata (StickyBar), dok se ne dođe do kraja tabele.
 *
 * Kao i StickyBar, NE koristi CSS position:sticky: tabela je u okviru sa horizontalnim skrolom (overflow-x),
 * pa bi se sticky lepio za taj okvir a ne za ekran. Umesto toga thead se pomera preko transform: translateY.
 * Aktivno je SAMO na velikim ekranima (>= 1024px), isto kao StickyBar.
 *
 * Vraća ref koji se stavlja na <table>. thead treba da ima neprovidnu pozadinu i z-index iznad ćelija tabele
 * (npr. "relative z-20 bg-white").
 */
export default function useStickyThead(enabled = true) {
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const table = tableRef.current;
    const thead = table?.tHead;
    if (!enabled || !table || !thead) return;

    const mq = window.matchMedia('(min-width: 1024px)');
    let frame = 0;

    const update = () => {
      frame = 0;
      if (!mq.matches) {
        thead.style.transform = '';
        return;
      }
      // Donja ivica zamrznute trake alata (ako je trenutno zamrznuta), inače vrh ekrana
      const bar = document.querySelector<HTMLElement>('[data-sticky-bar="pinned"]');
      const vrh = bar ? bar.getBoundingClientRect().bottom : 0;
      const t = table.getBoundingClientRect();
      const najvise = Math.max(0, t.height - thead.offsetHeight);
      const pomeraj = Math.min(Math.max(0, vrh - t.top), najvise);
      thead.style.transform = pomeraj > 0 ? `translateY(${pomeraj}px)` : '';
    };

    const zakazi = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', zakazi, { passive: true });
    window.addEventListener('resize', zakazi);
    // StickyBar javlja kad se zamrzne ili otpusti (posle skrola), da zaglavlje odmah stane ispod nje
    window.addEventListener('stickybar', zakazi);
    mq.addEventListener('change', zakazi);
    // tabela menja visinu kad se učitaju termini ili promeni nedelja
    const ro = new ResizeObserver(zakazi);
    ro.observe(table);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', zakazi);
      window.removeEventListener('resize', zakazi);
      window.removeEventListener('stickybar', zakazi);
      mq.removeEventListener('change', zakazi);
      ro.disconnect();
      thead.style.transform = '';
    };
  }, [enabled]);

  return tableRef;
}
