'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { izmeniOtkazanCasAsAdmin } from '@/app/admin/actions';

export type OtkazanZaIzmenu = {
  id: string;
  /** Dete (klijent). */
  ime: string;
  /** Npr. „pon 24.11. 14:00“. */
  kada: string;
  vrsta?: string | null;
  instruktor?: string | null;
  placeno: boolean;
  razlog?: string | null;
};

/**
 * Naknadna izmena otkazanog časa: naplaćen ili ne (naplaćen se računa u plaćene časove deteta) i
 * razlog/komentar. Otvara se klikom na otkazan čas na kalendaru i dugmetom na profilu deteta.
 * Prikazuje se preko cele strane (portal) – klik unutra ne „curi“ u karticu/link ispod.
 */
export default function UrediOtkazanCas({
  otkazan,
  onClose,
  onSacuvano,
}: {
  otkazan: OtkazanZaIzmenu;
  onClose: () => void;
  onSacuvano?: (novo: { placeno: boolean; razlog: string | null }) => void;
}) {
  const [placeno, setPlaceno] = useState(otkazan.placeno);
  const [razlog, setRazlog] = useState(otkazan.razlog ?? '');
  const [radi, setRadi] = useState(false);
  const naslovId = useId();
  const zatvori = useRef(onClose);
  useEffect(() => {
    zatvori.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const naTaster = (e: KeyboardEvent) => {
      if (e.key === 'Escape') zatvori.current();
    };
    window.addEventListener('keydown', naTaster);
    return () => window.removeEventListener('keydown', naTaster);
  }, []);

  const promenjeno = placeno !== otkazan.placeno || razlog.trim() !== (otkazan.razlog ?? '').trim();

  const sacuvaj = async () => {
    if (!promenjeno) {
      onClose();
      return;
    }
    setRadi(true);
    const res = await izmeniOtkazanCasAsAdmin(otkazan.id, { placeno, razlog });
    setRadi(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const novo = { placeno: res.placeno ?? placeno, razlog: res.razlog === undefined ? razlog.trim() || null : res.razlog };
    toast.success(
      novo.placeno !== otkazan.placeno
        ? novo.placeno
          ? 'Otkazan čas je naplaćen – računa se u plaćene časove.'
          : 'Skinuto „naplaćeno“ sa otkazanog časa.'
        : 'Sačuvano.'
    );
    onSacuvano?.(novo);
    onClose();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
      // Ne puštaj klikove dalje kroz React stablo (kartica je na profilu unutar linka).
      onClick={(e) => {
        e.stopPropagation();
        if (!radi) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={naslovId}
        className="w-full max-w-md rounded-2xl bg-white p-5 text-left text-stone-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={naslovId} className="text-base font-semibold text-stone-900">
          Otkazan čas
        </h2>
        <p className="mt-0.5 text-sm text-stone-600">
          <strong className="text-stone-800">{otkazan.ime}</strong> · {otkazan.kada}
          {otkazan.vrsta ? ` · ${otkazan.vrsta}` : ''}
          {otkazan.instruktor ? ` · ${otkazan.instruktor}` : ''}
        </p>

        <label
          className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${
            placeno ? 'border-indigo-300 bg-indigo-50' : 'border-stone-200 bg-stone-50'
          }`}
        >
          <input
            type="checkbox"
            checked={placeno}
            onChange={(e) => setPlaceno(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-600"
          />
          <span>
            <span className="block font-semibold">{placeno ? 'Naplaćen' : 'Nije naplaćen'}</span>
            <span className="block text-xs text-stone-600">
              Naplaćen otkazan čas se računa u plaćene časove deteta (troši jedan čas iz plaćenog paketa) i na kalendaru je indigo
              boje.
            </span>
          </span>
        </label>

        <label className="mt-4 block text-sm font-medium text-stone-700" htmlFor={`${naslovId}-razlog`}>
          Razlog / komentar
        </label>
        <textarea
          id={`${naslovId}-razlog`}
          value={razlog}
          maxLength={300}
          rows={3}
          autoFocus
          onChange={(e) => setRazlog(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sacuvaj();
          }}
          placeholder="npr. bolest; javili kasno – naplaćuje se"
          className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
        <p className="mt-1 text-xs text-stone-500">
          U rasporedu se ne ispisuje – vidi se u oblačiću (💬) i na profilu deteta. Prazno = briše se.
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={radi}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            Odustani
          </button>
          <button
            type="button"
            onClick={sacuvaj}
            disabled={radi}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-900 disabled:opacity-50"
          >
            {radi ? 'Čuvam…' : 'Sačuvaj'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
