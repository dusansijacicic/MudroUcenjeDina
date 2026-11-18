'use client';

import { useCallback, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Više izmena zaredom (npr. masovno zakazivanje) = jedno osvežavanje. */
const DEBOUNCE_MS = 1500;
/** Po završetku moda: kratko sačekaj – svež kalendar iz same operacije obično stiže baš tada. */
const POSLE_MODA_MS = 400;
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
 * se odlaže i uradi se kad se mod završi – da podaci ne promene raspored usred klikanja.
 *
 * `svezPodatak`: bilo šta što se menja kad stignu sveži podaci sa servera (npr. niz termina iz props).
 * Kad stignu – posle naše operacije (koja sama vrati osvežen kalendar) ili posle bilo kog osvežavanja –
 * poruke primljene do tada su već uračunate, pa se ne osvežava još jednom. Ranije je svaka operacija
 * povukla kalendar 3–4 puta (operacija + ručno + dva automatska), što je zatrpavalo bazu.
 */
export function useKalendarRealtime(paused: boolean, svezPodatak?: unknown) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const state = useRef({ paused, pending: false, refreshing: false, revision: 0, requestedRevision: 0, timer: undefined as number | undefined, hiddenAt: 0 });

  const refresh = useCallback(() => {
    const s = state.current;
    if (s.refreshing) return;
    window.clearTimeout(s.timer);
    s.pending = false;
    s.refreshing = true;
    s.requestedRevision = s.revision;
    startRefresh(() => router.refresh());
  }, [router]);

  const flush = useCallback(() => {
    const s = state.current;
    window.clearTimeout(s.timer);
    s.timer = undefined;
    // Samo ako zaista ima neosvežene izmene (tajmer i kraj moda ne smeju oba da osveže isto).
    if (!s.pending || s.paused || document.visibilityState !== 'visible') return;
    refresh();
  }, [refresh]);

  const zakazi = useCallback(
    (ms: number) => {
      const s = state.current;
      window.clearTimeout(s.timer);
      s.timer = window.setTimeout(flush, ms);
    },
    [flush]
  );

  // Stigli su sveži podaci → sve dosadašnje poruke su u njima; nema potrebe za još jednim učitavanjem.
  // (Mora biti pre efekta za `paused`, da se pri istom renderu prvo očisti, pa tek onda proveri.)
  useEffect(() => {
    const s = state.current;
    const changedDuringRefresh = s.refreshing && s.revision > s.requestedRevision;
    s.refreshing = false;
    s.pending = changedDuringRefresh;
    window.clearTimeout(s.timer);
    s.timer = undefined;
    if (s.pending && !s.paused) zakazi(POSLE_MODA_MS);
  }, [svezPodatak, zakazi]);

  useEffect(() => {
    const s = state.current;
    if (!refreshing) {
      s.refreshing = false;
      if (s.pending && !s.paused) zakazi(POSLE_MODA_MS);
    }
  }, [refreshing, zakazi]);

  useEffect(() => {
    state.current.paused = paused;
    if (!paused && state.current.pending) zakazi(POSLE_MODA_MS);
  }, [paused, zakazi]);

  useEffect(() => {
    const s = state.current;
    const markDirty = () => {
      s.revision += 1;
      s.pending = true;
      zakazi(DEBOUNCE_MS);
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
    const poll = window.setInterval(() => { s.refreshing = false; markDirty(); }, FALLBACK_POLL_MS);

    return () => {
      window.clearTimeout(s.timer);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
  }, [flush, zakazi]);
  return refresh;
}
