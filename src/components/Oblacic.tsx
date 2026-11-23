'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Posle ovoliko ms držanja miša iznad časa iskoči oblačić (da ne treperi dok se miš samo prevlači). */
const KASNJENJE_MS = 250;
/** Polovina najveće širine oblačića – da ne izađe van ekrana levo/desno. */
const POLA_SIRINE = 140;

/**
 * Oblačić (tooltip) za kalendar: napomena časa, razlog otkazivanja i sl. se NE ispisuju u rasporedu,
 * nego se vide kad se mišem pređe preko časa. Iscrtava se preko celog ekrana (portal), pa ga ne seku
 * ćelije kalendara. Bez sadržaja – samo prikazuje decu, bez oblačića.
 */
export default function Oblacic({
  sadrzaj,
  children,
  className,
}: {
  sadrzaj: ReactNode | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tajmer = useRef<number | undefined>(undefined);
  const [poz, setPoz] = useState<{ x: number; y: number; ispod: boolean } | null>(null);

  // Oblačić nestaje čim se stranica pomeri (inače bi ostao na starom mestu).
  useEffect(() => {
    if (!poz) return;
    const zatvori = () => setPoz(null);
    window.addEventListener('scroll', zatvori, true);
    window.addEventListener('resize', zatvori);
    return () => {
      window.removeEventListener('scroll', zatvori, true);
      window.removeEventListener('resize', zatvori);
    };
  }, [poz]);
  useEffect(() => () => window.clearTimeout(tajmer.current), []);

  if (!sadrzaj) return <>{children}</>;

  const otvori = () => {
    window.clearTimeout(tajmer.current);
    tajmer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const ispod = r.top < 150;
      const x = Math.min(Math.max(r.left + r.width / 2, POLA_SIRINE + 8), window.innerWidth - POLA_SIRINE - 8);
      setPoz({ x, y: ispod ? r.bottom + 8 : r.top - 8, ispod });
    }, KASNJENJE_MS);
  };
  const zatvori = () => {
    window.clearTimeout(tajmer.current);
    setPoz(null);
  };

  return (
    <div ref={ref} className={className} onMouseEnter={otvori} onMouseLeave={zatvori}>
      {children}
      {poz &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: poz.x,
              top: poz.y,
              transform: `translate(-50%, ${poz.ispod ? '0' : '-100%'})`,
              zIndex: 1000,
              maxWidth: POLA_SIRINE * 2,
            }}
            className="pointer-events-none rounded-lg bg-stone-900 px-3 py-2 text-xs leading-snug text-white shadow-lg"
          >
            {sadrzaj}
            <span
              aria-hidden="true"
              className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-stone-900"
              style={poz.ispod ? { top: -4 } : { bottom: -4 }}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

/** Jedan red u oblačiću: naslov (sitno, bledo) i tekst (čuva prelome redova). */
export function OblacicRed({ naslov, children }: { naslov: string; children: ReactNode }) {
  return (
    <span className="block [&+&]:mt-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400">{naslov}</span>
      <span className="block whitespace-pre-wrap break-words">{children}</span>
    </span>
  );
}
