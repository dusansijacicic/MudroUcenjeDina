import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import AdminClientForm from './AdminClientForm';
import { getStanjePoVrstamaZaKlijenta } from '@/app/admin/actions';
import { TIME_SLOTS } from '@/lib/constants';
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

  const adminSupabase = createAdminClient();
  const [{ data: client, error }, stanjePoVrstama, { data: predavanjaRaw }] = await Promise.all([
    adminSupabase.from('clients').select('*, popust_percent').eq('id', clientId).single(),
    getStanjePoVrstamaZaKlijenta(clientId),
    adminSupabase
      .from('predavanja')
      .select('id, odrzano, placeno, term_id, term:terms(date, slot_index, instructor:instructors(ime, prezime))')
      .eq('client_id', clientId)
      .order('term_id'),
  ]);

  if (error || !client) notFound();

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
    const d = (b.term.date ?? '').localeCompare(a.term.date ?? '');
    if (d !== 0) return d;
    return (b.term.slot_index ?? 0) - (a.term.slot_index ?? 0);
  };
  const odrzani = withTerm.filter((p) => p.odrzano).sort(sortByDateSlot);
  const zakazani = withTerm.filter((p) => !p.odrzano).sort(sortByDateSlot);

  const renderTermLink = (p: PredavanjeRow & { term: TermInfo }, isOdrzan: boolean) => {
    const t = p.term;
    const instr = t.instructor && !Array.isArray(t.instructor) ? t.instructor : (Array.isArray(t.instructor) ? t.instructor[0] : null);
    const dateStr = t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const timeStr = TIME_SLOTS[t.slot_index] ?? '—';
    return (
      <Link
        href={`/admin/termin/${p.term_id}`}
        className={`block rounded-xl border px-4 py-3 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400 ${
          isOdrzan
            ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/80 hover:border-emerald-300'
            : 'border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300'
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
    <div className="max-w-4xl space-y-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin/klijenti" className="text-sm text-stone-500 hover:text-amber-600 transition-colors inline-block mb-1">
            ← Svi klijenti
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
            {client.ime} {client.prezime}
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">Profil klijenta · pregled termina i izmena podataka</p>
        </div>
      </div>

      {/* Pregled termina – dva bloka na vrhu */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Pregled termina</h2>
          <p className="text-xs text-stone-500 mt-0.5">Klik na termin otvara admin stranicu termina. Sortirano od najnovijeg.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-0">
          <div className="p-5 border-b md:border-b-0 md:border-r border-stone-100">
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
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-800 font-semibold text-sm">
                {zakazani.length}
              </span>
              <h3 className="font-semibold text-stone-800">Zakazani</h3>
            </div>
            {zakazani.length === 0 ? (
              <p className="text-sm text-stone-500">Nema zakazanih (neodržanih) termina.</p>
            ) : (
              <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {zakazani.map((p) => (
                  <li key={p.id}>{renderTermLink(p, false)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Stanje po vrstama */}
      {stanjePoVrstama.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5">
          <h2 className="text-base font-semibold text-stone-800 mb-1">Stanje po vrstama časova</h2>
          <p className="text-xs text-stone-500 mb-4">Uplaćeno / održano / ostalo (svi predavači).</p>
          <div className="flex flex-wrap gap-3">
            {stanjePoVrstama.map((s) => (
              <div
                key={s.term_type_id ?? 'bez'}
                className="rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 min-w-[140px]"
              >
                <p className="font-medium text-stone-800 text-sm">{s.term_type_naziv}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-xs text-stone-600">
                  <span>upl. <strong className="text-stone-700">{s.uplaceno}</strong></span>
                  <span>odr. <strong className="text-stone-700">{s.odrzano}</strong></span>
                  <span className="text-amber-700">ost. <strong>{s.ostalo}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Izmena podataka */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5">
        <h2 className="text-base font-semibold text-stone-800 mb-1">Izmena podataka klijenta</h2>
        <p className="text-xs text-stone-500 mb-4">Plaćeno časova po predavaču se vodi kroz Evidenciju uplata.</p>
        <AdminClientForm client={client as Client} redirectAfterSave="/admin/klijenti" />
      </section>
    </div>
  );
}
