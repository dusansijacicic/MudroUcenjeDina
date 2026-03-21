import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { TIME_SLOTS } from '@/lib/constants';
import { getMaxCasovaPoTerminu } from '@/lib/settings';
import type { Predavanje } from '@/types/database';
import { deleteTermAsAdmin, getTermCategories } from '@/app/admin/actions';
import { jedanKlijentIzJoina, nazivKategorijeIzJoina } from '@/lib/term-categories';
import AdminTermMetaForm from '@/app/admin/termin/AdminTermMetaForm';

export default async function AdminTerminDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: termId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: admin } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
  if (!admin) redirect('/login');

  const adminSupabase = createAdminClient();
  const [termRes, termCategories] = await Promise.all([
    adminSupabase
      .from('terms')
      .select('*, instructor:instructors(id, ime, prezime), term_categories(id, naziv, jedan_klijent_po_terminu)')
      .eq('id', termId)
      .single(),
    getTermCategories(),
  ]);
  const term = termRes.data;
  if (!term) notFound();

  const instructor = Array.isArray((term as { instructor?: unknown }).instructor)
    ? (term as { instructor: Array<{ id: string; ime: string; prezime: string }> }).instructor[0]
    : (term as { instructor?: { id: string; ime: string; prezime: string } | null }).instructor;

  const { data: predavanja } = await adminSupabase
    .from('predavanja')
    .select('*, client:clients(id, ime, prezime)')
    .eq('term_id', termId)
    .order('created_at');

  const maxCasova = await getMaxCasovaPoTerminu();
  const currentCount = (predavanja ?? []).length;
  const tcRaw = (term as { term_categories?: unknown }).term_categories;
  const jedanOnly = jedanKlijentIzJoina(
    tcRaw as { jedan_klijent_po_terminu?: boolean } | { jedan_klijent_po_terminu?: boolean }[] | null
  );
  const categoryNaziv = nazivKategorijeIzJoina(tcRaw as { naziv?: string } | { naziv?: string }[] | null);
  const effectiveMax = jedanOnly ? 1 : maxCasova;
  const initialTermCategoryId =
    (term as { term_category_id?: string }).term_category_id ?? termCategories[0]?.id ?? '';
  const canAddMore = currentCount < effectiveMax;
  const slotLabel = TIME_SLOTS[term.slot_index] ?? '—';
  const dateLabel = new Date(term.date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-800 capitalize">{dateLabel}</h1>
          <p className="text-stone-500">{slotLabel}</p>
          <p className="text-sm text-stone-600 mt-1">
            Instruktor: {instructor ? `${instructor.ime} ${instructor.prezime}` : '—'}
          </p>
          <p className="text-sm text-stone-600 mt-1">
            <span className="font-medium">Kategorija:</span> {categoryNaziv}
            <span className="text-stone-400 mx-2">·</span>
            <span className="font-medium">Radionica:</span> {currentCount} / {effectiveMax}
          </p>
          {(term as { napomena?: string | null }).napomena ? (
            <p className="text-sm text-stone-500 mt-2 whitespace-pre-wrap border-l-2 border-amber-200 pl-3">
              {(term as { napomena?: string | null }).napomena}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/kalendar" className="text-sm text-stone-500 hover:text-stone-700">
            ← Kalendar
          </Link>
          <form
            action={async () => {
              'use server';
              const res = await deleteTermAsAdmin(termId);
              if (res.error) {
                return;
              }
              redirect('/admin/kalendar');
            }}
          >
            <button
              type="submit"
              className="text-sm text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1"
            >
              Otkaži termin
            </button>
          </form>
        </div>
      </div>

      <AdminTermMetaForm
        termId={termId}
        termCategories={termCategories}
        initialTermCategoryId={initialTermCategoryId}
        initialNapomena={(term as { napomena?: string | null }).napomena ?? null}
      />

      <div className="mb-6">
        {canAddMore ? (
          <Link
            href={`/admin/termin/${termId}/predavanje/novi`}
            className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            + Dodaj radionicu
          </Link>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 inline-block">
            {jedanOnly
              ? `Kategorija „${categoryNaziv}” – samo jedno dete. Za grupu promenite kategoriju iznad.`
              : `Maksimalan broj radionica u ovom terminu (${maxCasova}) je dostignut.`}
          </p>
        )}
        <span className="ml-2 text-stone-500 text-sm">{currentCount} / {effectiveMax} radionica</span>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {(predavanja ?? []).length === 0 ? (
          <div className="p-6 text-center text-stone-500">Nema radionica u ovom terminu.</div>
        ) : (
          (predavanja ?? []).map((p) => (
            <AdminPredavanjeRow key={p.id} predavanje={p} termId={termId} />
          ))
        )}
      </div>

      <p className="mt-4">
        <Link href="/admin/kalendar" className="text-sm text-amber-700 hover:underline">← Nazad na kalendar</Link>
      </p>
    </div>
  );
}

function AdminPredavanjeRow({
  predavanje,
  termId,
}: {
  predavanje: Predavanje & { client?: { id: string; ime: string; prezime: string } | null };
  termId: string;
}) {
  const clientName = predavanje.client
    ? `${predavanje.client.ime} ${predavanje.client.prezime}`
    : '—';
  return (
    <div className="p-4 flex items-start justify-between gap-4">
      <div>
        <p className="font-medium text-stone-800">{clientName}</p>
        <div className="flex gap-2 mt-1">
          {predavanje.odrzano && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Održano</span>
          )}
          {predavanje.placeno && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Plaćeno</span>
          )}
        </div>
        {predavanje.komentar && (
          <p className="mt-2 text-sm text-stone-600 whitespace-pre-wrap">{predavanje.komentar}</p>
        )}
      </div>
      <Link
        href={`/admin/termin/${termId}/predavanje/${predavanje.id}`}
        className="text-sm text-amber-600 hover:text-amber-700 shrink-0"
      >
        Izmeni
      </Link>
    </div>
  );
}
