import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { TIME_SLOTS } from '@/lib/constants';
import { danasBeograd } from '@/lib/datum';
import { ucitajBlokadeInstruktora } from '@/lib/blokade';
import BlokadeInstruktora from '@/components/BlokadeInstruktora';

/**
 * Stranica jednog instruktora (Admin → Instruktori → Pregled). Najvažnije: kada NE radi (stalni nedeljni
 * raspored + pojedinačni dani) – to se poštuje pri svakom zakazivanju. Ispod su sledeći časovi, a spisak
 * klijenata je sporedan (sklopljen).
 */
export default async function AdminViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  if (!(await getIsAdmin())) redirect('/login');

  const adminSupabase = createAdminClient();
  const danas = danasBeograd();
  const zaNedelju = new Date(`${danas}T12:00:00Z`);
  zaNedelju.setUTCDate(zaNedelju.getUTCDate() + 7);
  const doDatuma = zaNedelju.toISOString().slice(0, 10);

  const [{ data: instructor }, blok, { data: sledeciRaw }, { data: predRows }] = await Promise.all([
    adminSupabase.from('instructors').select('id, ime, prezime, email, telefon, color, aktivan').eq('id', id).maybeSingle(),
    ucitajBlokadeInstruktora(id, danas),
    adminSupabase
      .from('terms')
      .select('id, date, slot_index, classroom:classrooms(naziv), predavanja(client:clients(ime, prezime))')
      .eq('instructor_id', id)
      .gte('date', danas)
      .lte('date', doDatuma)
      .order('date')
      .order('slot_index'),
    adminSupabase.from('predavanja').select('client:clients(id, ime, prezime), term:terms!inner(instructor_id)').eq('term.instructor_id', id),
  ]);
  if (!instructor) notFound();

  type Ime = { ime?: string | null; prezime?: string | null };
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const sledeci = (sledeciRaw ?? []).map((t) => ({
    id: t.id as string,
    date: String(t.date).slice(0, 10),
    slot: t.slot_index as number,
    ucionica: one(t.classroom as { naziv?: string } | { naziv?: string }[] | null)?.naziv ?? null,
    deca: ((t.predavanja ?? []) as { client: Ime | Ime[] | null }[])
      .map((p) => one(p.client))
      .filter((c): c is Ime => !!c)
      .map((c) => `${c.ime ?? ''} ${c.prezime ?? ''}`.trim()),
  }));

  const klijentiMap = new Map<string, string>();
  for (const p of predRows ?? []) {
    const c = one(p.client as ({ id: string } & Ime) | ({ id: string } & Ime)[] | null);
    if (c && !klijentiMap.has(c.id)) klijentiMap.set(c.id, `${c.ime ?? ''} ${c.prezime ?? ''}`.trim());
  }
  const klijenti = [...klijentiMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'sr'));

  const ime = `${instructor.ime ?? ''} ${instructor.prezime ?? ''}`.trim();
  const nedeljnoSati = blok.nedeljne.length;

  return (
    <div className="max-w-5xl space-y-6 animate-in">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 shrink-0 rounded-xl border border-stone-200" style={{ backgroundColor: instructor.color ?? '#d6d3d1' }} />
          <div>
            <h1 className="text-xl font-semibold text-stone-800">
              {ime}
              {instructor.aktivan === false && (
                <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 align-middle text-xs font-medium text-stone-600">Suspendovan</span>
              )}
            </h1>
            <p className="text-sm text-stone-500">
              {instructor.email}
              {instructor.telefon ? ` · ${instructor.telefon}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/kalendar?view=nedelja&instructor=${instructor.id}`}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Kalendar ovog instruktora
          </Link>
          <Link href={`/admin/predavaci/${instructor.id}`} className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50">
            Uredi podatke
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Kada ne radi</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            {blok.migracijaPokrenuta
              ? `${nedeljnoSati} vremena nedeljno stalno blokirano · ${blok.blokade.length} blokada za predstojeće dane. U tim vremenima ovaj instruktor ne može dobiti čas (forma, više časova odjednom, dodela, premeštanje).`
              : 'Podešavanje kada instruktor ne radi.'}
          </p>
        </div>
        <div className="p-5">
          <BlokadeInstruktora
            mode="admin"
            instructorId={instructor.id}
            ime={ime}
            nedeljne={blok.nedeljne}
            blokade={blok.blokade}
            migracijaPokrenuta={blok.migracijaPokrenuta}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Sledećih 7 dana</h2>
        </div>
        {sledeci.length === 0 ? (
          <p className="p-5 text-sm text-stone-500">Nema zakazanih časova u narednih 7 dana.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {sledeci.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/termin/${t.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm hover:bg-stone-50">
                  <span className="w-32 shrink-0 font-medium capitalize text-stone-800">
                    {new Date(`${t.date}T12:00:00`).toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </span>
                  <span className="w-12 shrink-0 tabular-nums text-stone-600">{TIME_SLOTS[t.slot] ?? '—'}</span>
                  <span className="min-w-0 flex-1 text-stone-800">{t.deca.length > 0 ? t.deca.join(', ') : '(bez dece)'}</span>
                  {t.ucionica && <span className="rounded bg-stone-100 px-1.5 text-xs text-stone-600">{t.ucionica}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-stone-700">
          Klijenti ovog instruktora <span className="font-normal text-stone-400">({klijenti.length}, na osnovu časova)</span>
        </summary>
        {klijenti.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-stone-500">Još nema časova, pa ni klijenata.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-4 text-sm">
            {klijenti.map(([cid, naziv]) => (
              <li key={cid}>
                <Link href={`/admin/klijenti/${cid}`} className="text-stone-700 hover:text-amber-700 hover:underline">
                  {naziv}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
