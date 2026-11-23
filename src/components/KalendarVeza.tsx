'use client';

import { useEffect, useState } from 'react';
import { useKalendarVeza } from '@/lib/use-kalendar-realtime';

/**
 * Oznaka u traci kalendara: da li ovaj računar uživo prima izmene sa drugih računara, kad su stigli
 * poslednji sveži podaci i dugme za ručno osvežavanje. Bez žive veze kalendar se sam osvežava na 30 s.
 */
export default function KalendarVeza({ onOsvezi }: { onOsvezi?: () => void }) {
  const { status, svezeU } = useKalendarVeza();
  // 0 dok se ne učita u pregledaču – isti prvi prikaz na serveru i u pregledaču.
  const [sada, setSada] = useState(0);
  useEffect(() => {
    const otkucaj = () => setSada(Date.now());
    const prvi = window.setTimeout(otkucaj, 0);
    const t = window.setInterval(otkucaj, 15_000);
    return () => {
      window.clearTimeout(prvi);
      window.clearInterval(t);
    };
  }, [svezeU]);

  const sekundi = sada && svezeU ? Math.max(0, Math.round((sada - svezeU) / 1000)) : null;
  const kada = sekundi === null ? '' : sekundi < 60 ? 'upravo' : `pre ${Math.round(sekundi / 60)} min`;
  const naziv = status === 'uzivo' ? 'Uživo' : status === 'prekinuto' ? 'Bez žive veze' : 'Povezivanje…';
  const objasnjenje =
    status === 'uzivo'
      ? 'Izmene sa drugih računara stižu odmah.'
      : status === 'prekinuto'
      ? 'Izmene sa drugih računara ne stižu odmah (mreža ili veza). Kalendar se sam osvežava na 30 s – ili kliknite ⟳.'
      : 'Povezivanje za izmene uživo…';

  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={`${objasnjenje}${kada ? ` Podaci osveženi ${kada}.` : ''}`}>
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${
          status === 'uzivo' ? 'bg-emerald-500' : status === 'prekinuto' ? 'bg-amber-500' : 'bg-stone-300'
        }`}
      />
      <span className={status === 'prekinuto' ? 'font-medium text-amber-800' : 'text-stone-500'}>{naziv}</span>
      {kada && <span className="text-stone-400">· {kada}</span>}
      {onOsvezi && (
        <button
          type="button"
          onClick={onOsvezi}
          aria-label="Osveži kalendar"
          title="Osveži kalendar sada"
          className="rounded px-1.5 py-0.5 text-sm leading-none text-stone-600 hover:bg-stone-100"
        >
          ⟳
        </button>
      )}
    </span>
  );
}
