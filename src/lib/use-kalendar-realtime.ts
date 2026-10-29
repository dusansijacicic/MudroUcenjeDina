'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Više izmena zaredom (npr. masovno zakazivanje) = jedno osvežavanje. */
const DEBOUNCE_MS = 1500;
/** Posle ovoliko vremena u pozadini (tab/telefon zaspao, veza možda pukla) uvek se osveži pri povratku. */
const AWAY_MS = 60_000;
/** Rezerva ako Realtime veza ne radi (npr. migracija 045 još nije pokrenuta). */
const FALLBACK_POLL_MS = 5 * 60_000;

/**
 * Automatsko osvežavanje kalendara kad se bilo šta na njemu promeni u bazi – bilo ko, bilo gde
 * (drugi admin, predavač, učenik). Migracija 045 posle svake izmene termina/zahteva/blokade pošalje
 * kratku poruku na Realtime kanal 'kalendar' (bez podataka); ovde se na nju radi router.refresh(),
 * što povuče sveže podatke bez treptanja i bez gubljenja lokalnog stanja.
 *
 * `paused`: dok traje neki mod (izbor više termina, zamena, blokiranje…) ili prevlačenje, osvežavanje
 * se odlaže i uradi se čim se mod završi – da podaci ne promene raspored usred klikanja.
 */
export function useKalendarRealtime(paused: boolean) {
  const router = useRouter();
  const state = useRef({ paused, pending: false, timer: undefined as number | undefined, hiddenAt: 0 });

  const flush = useCallback(() => {
    const s = state.current;
    if (s.paused || document.visibilityState !== 'visible') return;
    s.pending = false;
    router.refresh();
  }, [router]);

  useEffect(() => {
    state.current.paused = paused;
    if (!paused && state.current.pending) flush();
  }, [paused, flush]);

  useEffect(() => {
    const s = state.current;
    const markDirty = () => {
      s.pending = true;
      window.clearTimeout(s.timer);
      s.timer = window.setTimeout(flush, DEBOUNCE_MS);
    };

    const supabase = createClient();
    const channel = supabase.channel('kalendar').on('broadcast', { event: 'promena' }, markDirty).subscribe();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        s.hiddenAt = Date.now();
        return;
      }
      if (s.hiddenAt && Date.now() - s.hiddenAt > AWAY_MS) s.pending = true;
      if (s.pending) flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const poll = window.setInterval(markDirty, FALLBACK_POLL_MS);

    return () => {
      window.clearTimeout(s.timer);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
  }, [flush]);
}
