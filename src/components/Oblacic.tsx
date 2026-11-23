'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Posle ovoliko ms držanja miša iznad časa iskoči oblačić (da ne treperi dok se miš samo prevlači). */
const KASNJENJE_MS = 200;
/** Polovina najveće širine oblačića – da ne izađe van ekrana levo/desno. */
const POLA_SIRINE = 160;

/** Boja zaglavlja i ikonica po vrsti oblačića. */
export type OblacicTon = 'napomena' | 'naplacen' | 'otkazan' | 'izuzetak' | 'placeno' | 'nijePlaceno' | 'termin';
const TONOVI: Record<OblacicTon, { ikona: string; pozadina: string; ivica: string; tekst: string }> = {
  napomena: { ikona: '💬', pozadina: '#fef3c7', ivica: '#fcd34d', tekst: '#78350f' },
  placeno: { ikona: '💰', pozadina: '#d1fae5', ivica: '#6ee7b7', tekst: '#064e3b' },
  nijePlaceno: { ikona: '!', pozadina: '#fee2e2', ivica: '#fca5a5', tekst: '#7f1d1d' },
  termin: { ikona: '🗓', pozadina: '#e0f2fe', ivica: '#7dd3fc', tekst: '#0c4a6e' },
  naplacen: { ikona: '💰', pozadina: '#e0e7ff', ivica: '#a5b4fc', tekst: '#312e81' },
  otkazan: { ikona: '✕', pozadina: '#f5f5f4', ivica: '#d6d3d1', tekst: '#44403c' },
  izuzetak: { ikona: '⇄', pozadina: '#ede9fe', ivica: '#c4b5fd', tekst: '#4c1d95' },
};

// Oblačići jedan u drugom (dete u terminu): prikazuje se samo poslednji u koji je miš ušao (najdublji).
let otvoreni: string[] = [];
const slusaoci = new Set<() => void>();
function postaviOtvorene(novi: string[]) {
  otvoreni = novi;
  slusaoci.forEach((f) => f());
}
function pretplati(f: () => void) {
  slusaoci.add(f);
  return () => {
    slusaoci.delete(f);
  };
}

/** Telefon/tablet (nema miša): oblačić se otvara tapom na ikonicu (OblacicDugme), ne prelaskom. */
const OblacicKontekst = createContext<{ id: string; prikazi: () => void } | null>(null);

function bezMisa(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches === true;
}

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
  kasnjenje = KASNJENJE_MS,
  children,
  className,
}: {
  sadrzaj: ReactNode | null | undefined;
  /** Naslov u zaglavlju (npr. „Napomena“, „Otkazan čas · naplaćen“). */
  naslov?: string;
  ton?: OblacicTon;
  /** ms do pojavljivanja (opšti podaci termina – duže, da ne iskaču dok se miš samo prevlači). */
  kasnjenje?: number;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const naVrhu = useSyncExternalStore(
    pretplati,
    () => otvoreni[otvoreni.length - 1] === id,
    () => false
  );
  const ref = useRef<HTMLDivElement>(null);
  const tajmer = useRef<number | undefined>(undefined);
  const [poz, setPoz] = useState<{ x: number; y: number; ispod: boolean } | null>(null);
  // Otvoren tapom (telefon/tablet) – zatvara se tapom bilo gde drugde.
  const [dodirom, setDodirom] = useState(false);

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
  useEffect(
    () => () => {
      window.clearTimeout(tajmer.current);
      postaviOtvorene(otvoreni.filter((x) => x !== id));
    },
    [id]
  );
  useEffect(() => {
    if (!poz || !dodirom) return;
    const van = (e: PointerEvent) => {
      // Tap na ikonicu ovog oblačića ga sam zatvara (OblacicDugme); sve ostalo zatvara ovde.
      if ((e.target as Element | null)?.closest?.(`[data-oblacic-ikonica="${CSS.escape(id)}"]`)) return;
      setPoz(null);
      setDodirom(false);
      postaviOtvorene(otvoreni.filter((x) => x !== id));
    };
    document.addEventListener('pointerdown', van, true);
    return () => document.removeEventListener('pointerdown', van, true);
  }, [poz, dodirom, id]);

  if (!sadrzaj) return <>{children}</>;

  const t = TONOVI[ton];
  const postavi = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const ispod = r.top < 180;
    const x = Math.min(Math.max(r.left + r.width / 2, POLA_SIRINE + 8), window.innerWidth - POLA_SIRINE - 8);
    setPoz({ x, y: ispod ? r.bottom + 10 : r.top - 10, ispod });
  };
  const otvori = () => {
    // Na ekranu na dodir pregledač „glumi“ prelazak mišem pri tapu – tamo se otvara samo ikonicom.
    if (bezMisa()) return;
    window.clearTimeout(tajmer.current);
    // Ulazak u unutrašnji oblačić ga stavlja na vrh – spoljašnji se tada ne prikazuje.
    postaviOtvorene([...otvoreni.filter((x) => x !== id), id]);
    tajmer.current = window.setTimeout(postavi, kasnjenje);
  };
  const zatvori = () => {
    if (dodirom) return;
    window.clearTimeout(tajmer.current);
    postaviOtvorene(otvoreni.filter((x) => x !== id));
    setPoz(null);
  };
  const prikaziDodirom = () => {
    window.clearTimeout(tajmer.current);
    if (poz && dodirom) {
      setPoz(null);
      setDodirom(false);
      postaviOtvorene(otvoreni.filter((x) => x !== id));
      return;
    }
    postaviOtvorene([...otvoreni.filter((x) => x !== id), id]);
    setDodirom(true);
    postavi();
  };

  return (
    <OblacicKontekst.Provider value={{ id, prikazi: prikaziDodirom }}>
    <div ref={ref} className={className} onMouseEnter={otvori} onMouseLeave={zatvori}>
      {children}
      {poz &&
        naVrhu &&
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
                // Na uskom telefonu ne šire od ekrana.
                maxWidth: `min(${POLA_SIRINE * 2}px, calc(100vw - 16px))`,
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
    </OblacicKontekst.Provider>
  );
}

/**
 * Ikonica koja otvara oblačić tapom (telefon, tablet) ili klikom; na računaru oblačić iskače i na prelazak
 * mišem. Klik ne otvara termin ispod (zaustavlja se).
 */
export function OblacicDugme({ children, className, oznaka }: { children: ReactNode; className?: string; oznaka: string }) {
  const ctx = useContext(OblacicKontekst);
  if (!ctx) return <span className={className}>{children}</span>;
  const aktiviraj = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.prikazi();
  };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={oznaka}
      data-oblacic-ikonica={ctx.id}
      className={`${className ?? ''} cursor-pointer`}
      onClick={aktiviraj}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') aktiviraj(e);
      }}
    >
      {children}
    </span>
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
