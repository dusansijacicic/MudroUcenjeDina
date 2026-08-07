'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "Zamrznuto" (sticky) ponašanje implementirano preko JS-a (position: fixed + IntersectionObserver
 * sentinel), NE preko CSS position:sticky. Razlog: position:sticky zavisi od suptilnih pravila o
 * ancestor elementima (overflow, transform, filter...) koja su se u ovom projektu pokazala
 * nepouzdana (traka alata se nije lepila pri skrolu uprkos ispravnim sticky klasama) – ovaj pristup
 * radi identično ali nezavisno od tih pravila. Aktivno je SAMO na velikim ekranima (>= 1024px);
 * kad je `enabled` false ili ekran manji, renderuje se kao običan div bez ikakvog efekta.
 */
export default function StickyBar({
  enabled,
  topOffset,
  className = '',
  children,
}: {
  /** Da li ova instanca uopšte treba da bude "zamrznuta" (npr. samo jedna od dve ugnježdene instance je aktivna odjednom). */
  enabled: boolean;
  /** Razmak od vrha ekrana (px) kada je fiksirano – npr. visina navigacije iznad. */
  topOffset: number;
  className?: string;
  children: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [box, setBox] = useState({ left: 0, width: 0, height: 0 });

  // Prati prirodnu poziciju/širinu/visinu dok NIJE fiksirano, da imamo tačne vrednosti spremne za
  // trenutak prelaska na position:fixed (kad se element izvadi iz normalnog toka).
  useEffect(() => {
    if (!enabled) return;
    const el = contentRef.current;
    if (!el) return;
    const update = () => {
      if (pinned) return;
      const r = el.getBoundingClientRect();
      setBox({ left: r.left, width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [enabled, pinned]);

  useEffect(() => {
    if (!enabled) {
      setPinned(false);
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    let large = mq.matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!large) {
          setPinned(false);
          return;
        }
        setPinned(!entry.isIntersecting);
      },
      { rootMargin: `-${topOffset + 1}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(sentinel);
    const onMqChange = () => {
      large = mq.matches;
      if (!large) setPinned(false);
    };
    mq.addEventListener('change', onMqChange);
    return () => {
      observer.disconnect();
      mq.removeEventListener('change', onMqChange);
    };
  }, [enabled, topOffset]);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={wrapperRef} style={pinned ? { height: box.height } : undefined}>
      <div ref={sentinelRef} style={{ height: 0 }} aria-hidden />
      <div
        ref={contentRef}
        className={className}
        style={
          pinned
            ? { position: 'fixed', top: topOffset, left: box.left, width: box.width, zIndex: 30 }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
