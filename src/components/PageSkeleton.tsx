/**
 * Prikaz dok server sprema stranicu (loading.tsx) – klik u meniju odmah menja ekran, umesto da
 * stara stranica "stoji" dok ne stignu podaci. Bez treptanja: blago pulsiranje, ugašeno uz
 * prefers-reduced-motion.
 */
export default function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" className="max-w-5xl space-y-4 motion-safe:animate-pulse">
      <span className="sr-only">Učitavam…</span>
      <div className="h-7 w-56 rounded-lg bg-stone-200" />
      <div className="h-4 w-80 max-w-full rounded bg-stone-200/80" />
      <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-9 rounded-lg bg-stone-100" />
        ))}
      </div>
    </div>
  );
}
