'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Posle ovoliko ms držanja miša iznad časa iskoči oblačić (da ne treperi dok se miš samo prevlači). */
const KASNJENJE_MS = 200;
/** Polovina najveće širine oblačića – da ne izađe van ekrana levo/desno. */
const POLA_SIRINE = 160;

/** Boja zaglavlja i ikonica po vrsti oblačića. */
export type OblacicTon = 'napomena' | 'naplacen' | 'otkazan' | 'izuzetak';
const TONOVI: Record<OblacicTon, { ikona: string; pozadina: string; ivica: string; tekst: string }> = {
  napomena: { ikona: '💬', pozadina: '#fef3c7', ivica: '#fcd34d', tekst: '#78350f' },
  naplacen: { ikona: '💰', pozadina: '#e0e7ff', ivica: '#a5b4fc', tekst: '#312e81' },
  otkazan: { ikona: '✕', pozadina: '#f5f5f4', ivica: '#d6d3d1', tekst: '#44403c' },
  izuzetak: { ikona: '⇄', pozadina: '#ede9fe', ivica: '#c4b5fd', tekst: '#4c1d95' },
};

/**
 * Oblačić za kalendar: napomena časa, razlog otkazivanja i sl. se NE ispisuju u rasporedu, nego se vide
 * kad se mišem pređe preko časa – kao mala kartica sa zaglavljem u boji (naslov + ikonica) i krupnijim
 * tekstom. Iscrtava se preko celog ekrana (portal), pa ga ne seku ćelije kalendara. Bez sadržaja –
 * samo prikazuje decu.
 */
export default function Oblacic({
  sadrzaj,
  naslov,
  ton = 'napomena',
  children,
  className,
}: {
  sadrzaj: ReactNode | null | undefined;
  /** Naslov u zaglavlju (npr. „Napomena“, „Otkazan čas · naplaćen“). */
  naslov?: string;
  ton?: OblacicTon;
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

  const t = TONOVI[ton];
  const otvori = () => {
    window.clearTimeout(tajmer.current);
    tajmer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const ispod = r.top < 180;
      const x = Math.min(Math.max(r.left + r.width / 2, POLA_SIRINE + 8), window.innerWidth - POLA_SIRINE - 8);
      setPoz({ x, y: ispod ? r.bottom + 10 : r.top - 10, ispod });
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
          // Spoljni sloj samo postavlja mesto (transform); kartica unutra ima animaciju pojavljivanja.
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: poz.x,
              top: poz.y,
              transform: `translate(-50%, ${poz.ispod ? '0' : '-100%'})`,
              zIndex: 1000,
              pointerEvents: 'none',
            }}
          >
            <div
              className="animate-scale-in relative w-max overflow-visible rounded-xl border bg-white text-stone-800 shadow-xl"
              style={{
                maxWidth: POLA_SIRINE * 2,
                minWidth: 180,
                borderColor: t.ivica,
                transformOrigin: poz.ispod ? 'top center' : 'bottom center',
                boxShadow: '0 12px 28px -8px rgba(28, 25, 23, 0.28), 0 2px 6px rgba(28, 25, 23, 0.08)',
              }}
            >
              <div
                className="flex items-center gap-2 rounded-t-xl px-3 py-2 text-[13px] font-semibold"
                style={{ backgroundColor: t.pozadina, color: t.tekst, borderBottom: `1px solid ${t.ivica}` }}
              >
                <span aria-hidden="true" className="text-[15px] leading-none">
                  {t.ikona}
                </span>
                <span>{naslov ?? 'Napomena'}</span>
              </div>
              <div className="space-y-2 px-3 py-2.5 text-[14px] leading-snug">{sadrzaj}</div>
              {/* Strelica ka času – boje zaglavlja kad je oblačić ispod, bela kad je iznad. */}
              <span
                aria-hidden="true"
                className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45"
                style={
                  poz.ispod
                    ? { top: -6.5, backgroundColor: t.pozadina, borderLeft: `1px solid ${t.ivica}`, borderTop: `1px solid ${t.ivica}` }
                    : { bottom: -6.5, backgroundColor: '#ffffff', borderRight: `1px solid ${t.ivica}`, borderBottom: `1px solid ${t.ivica}` }
                }
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/** Jedan red u oblačiću: kratka oznaka (sitno, bledo) i tekst (krupnije, čuva prelome redova). */
export function OblacicRed({ naslov, children }: { naslov?: string; children: ReactNode }) {
  return (
    <span className="block">
      {naslov && <span className="block text-[11px] font-semibold uppercase tracking-wide text-stone-500">{naslov}</span>}
      <span className="block whitespace-pre-wrap break-words text-stone-800">{children}</span>
    </span>
  );
}
