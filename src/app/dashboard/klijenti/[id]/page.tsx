import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getStanjePoVrstamaZaKlijenta, markPastPredavanjaAsOdrzano } from '@/app/admin/actions';
import ClientForm from '../ClientForm';
import type { Client, Predavanje } from '@/types/database';
import { TIME_SLOTS, isTermInPast } from '@/lib/constants';

export default async function KlijentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const admin = createAdminClient();
  const { data: clientRow, error } = await admin.from('clients').select('*').eq('id', id).single();
  if (error || !clientRow) notFound();

  const { data: myLink } = await admin
    .from('instructor_clients')
    .select('placeno_casova')
    .eq('instructor_id', instructor.id)
    .eq('client_id', id)
    .maybeSingle();
  const client = { ...(clientRow as Client), placeno_casova: myLink?.placeno_casova ?? 0 };

  const { data: allLinks } = await admin
    .from('instructor_clients')
    .select('instructor_id, placeno_casova')
    .eq('client_id', id);

  await markPastPredavanjaAsOdrzano(id);

  const { data: predavanja } = await admin
    .from('predavanja')
    .select('*, term:terms(date, slot_index, instructor_id)')
    .eq('client_id', id)
    .limit(100);

  const allLessons = predavanja ?? [];
  type TermShape = { date: string; slot_index: number; instructor_id?: string };
  const withTerm = allLessons
    .map((p) => ({
      ...p,
      termNorm: Array.isArray(p.term) ? p.term[0] : p.term,
    }))
    .filter((p): p is typeof p & { termNorm: TermShape } => p.termNorm != null && typeof p.termNorm === 'object' && 'date' in p.termNorm);
  const predavanjaForThisInstructor = withTerm.filter(
    (p) => p.termNorm.instructor_id === instructor.id
  );
  const sortByDateSlot = (a: { termNorm: TermShape }, b: { termNorm: TermShape }) => {
    const c = (a.termNorm.date ?? '').localeCompare(b.termNorm.date ?? '');
    if (c !== 0) return c;
    return (a.termNorm.slot_index ?? 0) - (b.termNorm.slot_index ?? 0);
  };
  const isPast = (p: { termNorm: TermShape }) => isTermInPast(p.termNorm.date, p.termNorm.slot_index ?? 0);
  const odrzani = predavanjaForThisInstructor.filter((p) => p.odrzano || isPast(p)).sort((a, b) => -sortByDateSlot(a, b));
  const zakazani = predavanjaForThisInstructor.filter((p) => !p.odrzano && !isPast(p)).sort(sortByDateSlot);

  const odrzanoUkupno = allLessons.filter((p) => p.odrzano).length;
  const odrzanoKodMene = odrzani.length;
  const placenoKodMene = predavanjaForThisInstructor.filter((p) => p.placeno).length;

  const placenoUkupno = (allLinks ?? []).reduce(
    (sum, row) => sum + (row.placeno_casova ?? 0),
    0
  );
  const preostaloUkupno = placenoUkupno - odrzanoUkupno;
  const duguje = preostaloUkupno < 0 ? Math.abs(preostaloUkupno) : 0;

  const stanjePoVrstamaRaw = await getStanjePoVrstamaZaKlijenta(id);
  const stanjePoVrstama = stanjePoVrstamaRaw.filter((s) => s.uplaceno >= 1);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-800">
          {client.ime} {client.prezime}
        </h1>
        <Link
          href="/dashboard/klijenti"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← Nazad na listu
        </Link>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Statistika časova za ovog klijenta</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Plaćeno (škola) = ukupno plaćeno preko svih predavača. Održano = kod svih predavača. Preostalo = plaćeno − održano.
          </p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3">
              <p className="text-xs text-stone-500 uppercase tracking-wide">Plaćeno (škola)</p>
              <p className="text-xl font-bold text-stone-800 mt-0.5">{placenoUkupno}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
              <p className="text-xs text-emerald-700 uppercase tracking-wide">Održano ukupno</p>
              <p className="text-xl font-bold text-emerald-800 mt-0.5">{odrzanoUkupno}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3">
              <p className="text-xs text-sky-700 uppercase tracking-wide">Preostalo</p>
              <p className="text-xl font-bold text-sky-800 mt-0.5">{preostaloUkupno}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-amber-50/80 px-4 py-3">
              <p className="text-xs text-amber-700 uppercase tracking-wide">Održano kod vas</p>
              <p className="text-xl font-bold text-amber-800 mt-0.5">{odrzanoKodMene}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-blue-50/80 px-4 py-3">
              <p className="text-xs text-blue-700 uppercase tracking-wide">Plaćeno kod vas</p>
              <p className="text-xl font-bold text-blue-800 mt-0.5">{placenoKodMene}</p>
            </div>
          </div>
          {duguje > 0 && (
            <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              Duguje novac za <strong>{duguje}</strong> termina (više održanih nego plaćenih).
            </p>
          )}
        </div>
      </section>

      {stanjePoVrstama.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
            <h2 className="text-base font-semibold text-stone-800">Pregled po vrstama časova</h2>
            <p className="text-xs text-stone-500 mt-0.5">Plaćeno / održano / preostalo – samo vrste gde je plaćen makar jedan čas.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80">
                  <th className="text-left p-3 font-medium text-stone-600">Vrsta časa</th>
                  <th className="text-right p-3 font-medium text-stone-600">Plaćeno</th>
                  <th className="text-right p-3 font-medium text-stone-600">Održano</th>
                  <th className="text-right p-3 font-medium text-amber-700">Preostalo</th>
                </tr>
              </thead>
              <tbody>
                {stanjePoVrstama.map((s) => (
                  <tr key={s.term_type_id ?? 'bez'} className="border-b border-stone-100 hover:bg-stone-50/50">
                    <td className="p-3 font-medium text-stone-800">{s.term_type_naziv}</td>
                    <td className="p-3 text-right text-stone-700">{s.uplaceno}</td>
                    <td className="p-3 text-right text-stone-700">{s.odrzano}</td>
                    <td className="p-3 text-right font-medium text-amber-800">{s.ostalo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ClientForm instructorId={instructor.id} client={client} />

      <p className="text-stone-500 text-sm">
        „Plaćeno časova (škola)” dobija se sabiranjem plaćenih paketa kod svih predavača. U formi ispod i dalje menjate paket za vašu vezu sa klijentom.
      </p>

      <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Istorija časova – kod vas</h2>
          <p className="text-xs text-stone-500 mt-0.5">Sortirano po datumu. Termini čije je vreme prošlo automatski se označavaju kao održani.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-0">
          <div className="p-5 border-b md:border-b-0 md:border-r border-stone-100">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-800 font-semibold text-sm">{zakazani.length}</span>
              <h3 className="font-semibold text-stone-800">Zakazani za budućnost</h3>
            </div>
            {zakazani.length === 0 ? (
              <p className="text-sm text-stone-500">Nema zakazanih termina u budućnosti.</p>
            ) : (
              <ul className="space-y-2 max-h-[280px] overflow-y-auto">
                {zakazani.map((p) => (
                  <li key={p.id}>
                    <PredavanjeHistoryRow predavanje={{ ...p, term: p.termNorm }} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-semibold text-sm">{odrzani.length}</span>
              <h3 className="font-semibold text-stone-800">Održani</h3>
            </div>
            {odrzani.length === 0 ? (
              <p className="text-sm text-stone-500">Nema održanih termina.</p>
            ) : (
              <ul className="space-y-2 max-h-[280px] overflow-y-auto">
                {odrzani.map((p) => (
                  <li key={p.id}>
                    <PredavanjeHistoryRow predavanje={{ ...p, term: p.termNorm }} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PredavanjeHistoryRow({
  predavanje,
}: {
  predavanje: Predavanje & { term?: { date: string; slot_index: number } | null };
}) {
  const slot = predavanje.term
    ? TIME_SLOTS[predavanje.term.slot_index] ?? '—'
    : '—';
  const dateFormatted = predavanje.term
    ? new Date(predavanje.term.date + 'T12:00:00').toLocaleDateString(
        'sr-Latn-RS',
        { day: '2-digit', month: '2-digit', year: 'numeric' }
      )
    : '—';
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-medium text-stone-800">
          {dateFormatted} • {slot}
        </span>
        <div className="flex gap-2">
          {predavanje.odrzano && (
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium">
              Održano
            </span>
          )}
          {predavanje.placeno && (
            <span className="text-xs bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-medium">
              Plaćeno
            </span>
          )}
        </div>
      </div>
      {predavanje.komentar && (
        <p className="mt-2 text-stone-600 text-sm whitespace-pre-wrap">
          {predavanje.komentar}
        </p>
      )}
      <Link
        href={`/dashboard/predavanje/${predavanje.id}`}
        className="mt-2 inline-block text-sm text-amber-600 hover:text-amber-700"
      >
        Izmeni predavanje →
      </Link>
    </div>
  );
}
