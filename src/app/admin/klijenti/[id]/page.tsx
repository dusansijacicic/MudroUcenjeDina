import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import AdminClientForm from './AdminClientForm';
import { getStanjePoVrstamaZaKlijenta, markPastPredavanjaAsOdrzano } from '@/app/admin/actions';
import { TIME_SLOTS, isTermInPast } from '@/lib/constants';
import type { Client } from '@/types/database';

export default async function AdminKlijentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login');

  await markPastPredavanjaAsOdrzano(clientId);

  const adminSupabase = createAdminClient();
  const [{ data: client, error }, stanjePoVrstama, { data: predavanjaRaw }] = await Promise.all([
    adminSupabase.from('clients').select('*, popust_percent').eq('id', clientId).single(),
    getStanjePoVrstamaZaKlijenta(clientId),
    adminSupabase
      .from('predavanja')
      .select('id, odrzano, placeno, term_id, term:terms(date, slot_index, instructor:instructors(ime, prezime))')
      .eq('client_id', clientId),
  ]);

  if (error || !client) notFound();

  const stanjePoVrstamaPrikaz = stanjePoVrstama.filter((s) => s.uplaceno >= 1);

  type TermInfo = { date: string; slot_index: number; instructor?: { ime?: string; prezime?: string } | { ime?: string; prezime?: string }[] | null };
  type PredavanjeRow = { id: string; odrzano: boolean; placeno: boolean; term_id: string; term: TermInfo | TermInfo[] | null };
  const predavanjaList = (predavanjaRaw ?? []) as PredavanjeRow[];
  const withTerm = predavanjaList
    .map((p) => {
      const term = Array.isArray(p.term) ? p.term[0] : p.term;
      return { ...p, term };
    })
    .filter((p): p is PredavanjeRow & { term: TermInfo } => p.term != null && typeof p.term === 'object' && 'date' in p.term);
  const sortByDateSlot = (a: { term: TermInfo }, b: { term: TermInfo }) => {
    const d = (a.term.date ?? '').localeCompare(b.term.date ?? '');
    if (d !== 0) return d;
    return (a.term.slot_index ?? 0) - (b.term.slot_index ?? 0);
  };
  const sortByDateSlotDesc = (a: { term: TermInfo }, b: { term: TermInfo }) => -sortByDateSlot(a, b);
  const isPast = (p: { term: TermInfo }) => isTermInPast(p.term.date, p.term.slot_index ?? 0);
  const odrzani = withTerm.filter((p) => p.odrzano || isPast(p)).sort(sortByDateSlotDesc);
  const zakazani = withTerm.filter((p) => !p.odrzano && !isPast(p)).sort(sortByDateSlot);

  const renderTermLink = (p: PredavanjeRow & { term: TermInfo }, isOdrzan: boolean) => {
    const t = p.term;
    const instr = t.instructor && !Array.isArray(t.instructor) ? t.instructor : (Array.isArray(t.instructor) ? t.instructor[0] : null);
    const dateStr = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const timeStr = TIME_SLOTS[t.slot_index] ?? '—';
    return (
      <Link
        href={`/admin/termin/${p.term_id}`}
        className={`block rounded-xl border px-4 py-3 ui-transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 ${
          isOdrzan
            ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/80 hover:border-emerald-300 hover:-translate-y-0.5'
            : 'border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300 hover:-translate-y-0.5'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-stone-900">{dateStr}</span>
            <span className="text-stone-600 ml-2">{timeStr}</span>
          </div>
          {isOdrzan && p.placeno && (
            <span className="rounded-full bg-emerald-200/80 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Plaćeno</span>
          )}
        </div>
        {instr && (
          <p className="mt-1 text-sm text-stone-600">{instr.ime} {instr.prezime}</p>
        )}
      </Link>
    );
  };

  return (
    <div className="max-w-4xl space-y-10 animate-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 animate-in-delay-1">
        <div>
          <Link href="/admin/klijenti" className="text-sm text-stone-500 hover:text-amber-600 ui-transition inline-block mb-1 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded">
            ← Svi klijenti
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            {client.ime} {client.prezime}
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">Profil klijenta · pregled termina i izmena podataka</p>
        </div>
      </div>

      {/* Summary: ukupno i održano po tipu */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-2 ui-hover-lift">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Pregled po vrstama časova</h2>
          <p className="text-xs text-stone-500 mt-0.5">Plaćeno / održano / preostalo – samo vrste gde je plaćen makar jedan čas.</p>
        </div>
        <div className="overflow-x-auto">
          {stanjePoVrstamaPrikaz.length === 0 ? (
            <div className="p-5 text-sm text-stone-500">Nema vrste časa gde je plaćen makar jedan.</div>
          ) : (
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
                {stanjePoVrstamaPrikaz.map((s) => (
                  <tr key={s.term_type_id ?? 'bez'} className="border-b border-stone-100 hover:bg-stone-50/50 ui-transition">
                    <td className="p-3 font-medium text-stone-800">{s.term_type_naziv}</td>
                    <td className="p-3 text-right text-stone-700">{s.uplaceno}</td>
                    <td className="p-3 text-right text-stone-700">{s.odrzano}</td>
                    <td className="p-3 text-right font-medium text-amber-800">{s.ostalo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Pregled termina – zakazani za budućnost / održani (sortirano po datumu) */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden animate-in-delay-3">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Pregled termina</h2>
          <p className="text-xs text-stone-500 mt-0.5">Sortirano po datumu. Termini čije je vreme prošlo automatski se označavaju kao održani.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-0">
          <div className="p-5 border-b md:border-b-0 md:border-r border-stone-100">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-800 font-semibold text-sm">
                {zakazani.length}
              </span>
              <h3 className="font-semibold text-stone-800">Zakazani za budućnost</h3>
            </div>
            {zakazani.length === 0 ? (
              <p className="text-sm text-stone-500">Nema zakazanih termina u budućnosti.</p>
            ) : (
              <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {zakazani.map((p) => (
                  <li key={p.id}>{renderTermLink(p, false)}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-semibold text-sm">
                {odrzani.length}
              </span>
              <h3 className="font-semibold text-stone-800">Održani</h3>
            </div>
            {odrzani.length === 0 ? (
              <p className="text-sm text-stone-500">Nema održanih termina.</p>
            ) : (
              <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {odrzani.map((p) => (
                  <li key={p.id}>{renderTermLink(p, true)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Izmena podataka */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5 animate-in-delay-4">
        <h2 className="text-base font-semibold text-stone-800 mb-1">Izmena podataka klijenta</h2>
        <p className="text-xs text-stone-500 mb-4">Plaćeno časova po predavaču se vodi kroz Evidenciju uplata.</p>
        <AdminClientForm client={client as Client} redirectAfterSave="/admin/klijenti" />
      </section>
    </div>
  );
}
