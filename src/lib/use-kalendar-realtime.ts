'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Više izmena zaredom (npr. masovno zakazivanje) = jedno osvežavanje. */
const DEBOUNCE_MS = 1500;
/** Po završetku moda: kratko sačekaj – svež kalendar iz same operacije obično stiže baš tada. */
const POSLE_MODA_MS = 400;
/** Posle ovoliko vremena u pozadini (tab/telefon zaspao, veza možda pukla) uvek se osveži pri povratku. */
const AWAY_MS = 60_000;
/** Rezerva i kad Realtime radi: svež kalendar najkasnije ovoliko često. */
const FALLBACK_POLL_MS = 5 * 60_000;
/** Bez žive veze (mreža blokira WebSocket, laptop se probudio, Realtime pao): osvežavaj češće. */
const BEZ_VEZE_POLL_MS = 30_000;
/** Povratak na prozor (klik u prozor, prebacivanje sa drugog programa): osveži ako su podaci stariji od ovoga. */
const FOKUS_MS = 30_000;

export type KalendarVezaStatus = 'povezivanje' | 'uzivo' | 'prekinuto';
type KalendarVeza = { status: KalendarVezaStatus; svezeU: number };

/** Stanje žive veze i vreme poslednjih svežih podataka – za oznaku na kalendaru (KalendarVeza). */
let veza: KalendarVeza = { status: 'povezivanje', svezeU: 0 };
const slusaoci = new Set<() => void>();
function postaviVezu(izmena: Partial<KalendarVeza>) {
  veza = { ...veza, ...izmena };
  slusaoci.forEach((f) => f());
}
function pretplati(f: () => void) {
  slusaoci.add(f);
  return () => {
    slusaoci.delete(f);
  };
}
const SERVER_VEZA: KalendarVeza = { status: 'povezivanje', svezeU: 0 };

/** Da li je kalendar uživo povezan i kad su stigli poslednji sveži podaci. */
export function useKalendarVeza(): KalendarVeza {
  return useSyncExternalStore(pretplati, () => veza, () => SERVER_VEZA);
}

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
    postaviVezu({ svezeU: Date.now() });
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
    // Status veze: dok nije „uživo“, izmene sa drugih računara ne stižu odmah – tada se osvežava češće,
    // a po ponovnom povezivanju odmah, jer su poruke iz vremena prekida izgubljene.
    const channel = supabase
      .channel('kalendar')
      .on('broadcast', { event: 'promena' }, markDirty)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const bioPrekid = veza.status === 'prekinuto';
          postaviVezu({ status: 'uzivo' });
          if (bioPrekid) markDirty();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          postaviVezu({ status: 'prekinuto' });
        }
      });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        s.hiddenAt = Date.now();
        return;
      }
      if (s.hiddenAt && Date.now() - s.hiddenAt > AWAY_MS) s.pending = true;
      if (s.pending) flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // Klik u prozor posle rada u drugom programu (prozor je sve vreme „vidljiv“, pa visibilitychange ne
    // stiže) i povratak mreže: osveži ako podaci nisu sveži.
    const onFokus = () => {
      if (Date.now() - veza.svezeU > FOKUS_MS) {
        s.pending = true;
        flush();
      }
    };
    window.addEventListener('focus', onFokus);
    window.addEventListener('online', onFokus);
    // Rezerva: bez žive veze na 30 s, sa vezom na 5 min.
    const poll = window.setInterval(() => {
      const granica = veza.status === 'uzivo' ? FALLBACK_POLL_MS : BEZ_VEZE_POLL_MS;
      if (Date.now() - veza.svezeU < granica) return;
      s.refreshing = false;
      markDirty();
    }, BEZ_VEZE_POLL_MS);

    return () => {
      window.clearTimeout(s.timer);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFokus);
      window.removeEventListener('online', onFokus);
      supabase.removeChannel(channel);
      postaviVezu({ status: 'povezivanje' });
    };
  }, [flush, zakazi]);
  return refresh;
}
