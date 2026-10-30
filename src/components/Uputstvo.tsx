/** Zajednički delovi uputstva (admin i predavač): sekcija, numerisani koraci, nazivi dugmadi, napomene. */

export function Sekcija({
  id,
  naslov,
  prikazi,
  children,
}: {
  id: string;
  naslov: string;
  /** null = celo uputstvo; inače samo sekcije za izabranu stranicu. */
  prikazi: Set<string> | null;
  children: React.ReactNode;
}) {
  if (prikazi && !prikazi.has(id)) return null;
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-stone-700 text-white">
        <h2 className="text-lg font-semibold text-balance">{naslov}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </section>
  );
}

export function Podnaslov({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-1 text-sm font-semibold text-stone-900">{children}</h3>;
}

/** Numerisani koraci – redosled je bitan (klik po klik), brojevi odgovaraju markerima na šemi. */
export function Koraci({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 pl-6 text-sm leading-relaxed text-stone-800 marker:font-bold marker:text-amber-700">
      {children}
    </ol>
  );
}

export function Lista({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-800 marker:text-amber-600">{children}</ul>;
}

/** Naziv dugmeta/polja tačno kako piše u aplikaciji. */
export function Ui({ children }: { children: React.ReactNode }) {
  return <span className="box-decoration-clone rounded border border-stone-300 bg-stone-50 px-1 py-px text-[0.92em] font-medium text-stone-900">{children}</span>;
}

export function Crveno({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-red-600 px-1 text-xs font-bold text-white">{children}</span>;
}

export function Napomena({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-stone-800">{children}</p>;
}

export function Upozorenje({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{children}</p>;
}
