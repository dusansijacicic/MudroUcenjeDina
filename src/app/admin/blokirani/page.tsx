import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TIME_SLOTS, AUTO_SPILLOVER_NAPOMENA } from '@/lib/constants';
import UnblockButton from './UnblockButton';

type Conflict = { id: string; href: string; label: string };

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('sr-Latn-RS', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getMonday(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export default async function AdminBlokiraniPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const admin = createAdminClient();
  const { data: blocksRaw, error } = await admin
    .from('blokirani_termini')
    .select('id, date, slot_index, napomena, created_at')
    .order('date', { ascending: false })
    .order('slot_index');

  if (error) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold text-stone-800 mb-2">Blokirani termini</h1>
        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
          Tabela blokiranih termina još ne postoji – pokrenite migraciju 044_blokirani_termini.sql u Supabase SQL Editoru.
        </p>
      </div>
    );
  }

  const blocks = (blocksRaw ?? []).map((b) => ({
    id: b.id as string,
    date: String(b.date).slice(0, 10),
    slot: b.slot_index as number,
    napomena: (b.napomena as string | null) ?? null,
  }));
  const dates = [...new Set(blocks.map((b) => b.date))];

  // Termini i zahtevi koji su ostali u blokiranim slotovima (zakazani pre blokiranja) – treba ih premestiti.
  const [{ data: termsRaw }, { data: zahteviRaw }] = dates.length
    ? await Promise.all([
        admin
          .from('terms')
          .select('id, date, slot_index, napomena, nastavak_of_term_id, instructor:instructors(ime, prezime), classroom:classrooms(naziv), predavanja(client:clients(ime, prezime))')
          .in('date', dates),
        admin
          .from('zahtevi_za_cas')
          .select('id, requested_date, requested_slot_index, client:clients(ime, prezime)')
          .eq('status', 'pending')
          .in('requested_date', dates),
      ])
    : [{ data: [] }, { data: [] }];

  const conflictsByKey = new Map<string, Conflict[]>();
  const push = (key: string, c: Conflict) => conflictsByKey.set(key, [...(conflictsByKey.get(key) ?? []), c]);

  for (const t of termsRaw ?? []) {
    if (t.nastavak_of_term_id && t.napomena === AUTO_SPILLOVER_NAPOMENA) continue;
    const instr = one(t.instructor as { ime: string; prezime: string } | { ime: string; prezime: string }[] | null);
    const room = one(t.classroom as { naziv: string } | { naziv: string }[] | null);
    const deca = ((t.predavanja ?? []) as { client: { ime: string; prezime: string } | { ime: string; prezime: string }[] | null }[])
      .map((p) => one(p.client))
      .filter((c): c is { ime: string; prezime: string } => !!c)
      .map((c) => `${c.ime} ${c.prezime}`)
      .join(', ');
    push(`${String(t.date).slice(0, 10)}|${t.slot_index}`, {
      id: `t-${t.id}`,
      href: `/admin/termin/${t.id}`,
      label: `${instr ? `${instr.ime} ${instr.prezime}` : '—'}${room ? ` (${room.naziv})` : ''}${deca ? ` – ${deca}` : ''}`,
    });
  }
  for (const z of zahteviRaw ?? []) {
    const c = one(z.client as { ime: string; prezime: string } | { ime: string; prezime: string }[] | null);
    const date = String(z.requested_date).slice(0, 10);
    push(`${date}|${z.requested_slot_index}`, {
      id: `z-${z.id}`,
      href: `/admin/kalendar?view=nedelja&week=${getMonday(date)}&fokus=${date}`,
      label: `Zahtev bez instruktora – ${c ? `${c.ime} ${c.prezime}` : '—'}`,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const needMoving = blocks.filter((b) => b.date >= today && (conflictsByKey.get(`${b.date}|${b.slot}`)?.length ?? 0) > 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-800">Blokirani termini</h1>
        <p className="text-stone-500 text-sm mt-0.5">
          Blokiraju se na kalendaru dugmetom „Blokiraj termin(e)“. U blokiranom terminu niko ne može da zakaže.
        </p>
      </div>

      {needMoving.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">⚠ {needMoving.length} blokiran(ih) termin(a) i dalje ima zakazane časove – treba ih premestiti.</p>
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {blocks.length === 0 ? (
          <div className="p-6 text-center text-stone-500">Nema blokiranih termina.</div>
        ) : (
          blocks.map((b) => {
            const conflicts = conflictsByKey.get(`${b.date}|${b.slot}`) ?? [];
            const past = b.date < today;
            return (
              <div key={b.id} className={`p-4 flex items-start justify-between gap-4${past ? ' opacity-60' : ''}`}>
                <div className="min-w-0">
                  <p className="font-medium text-stone-800">
                    ⛔ {formatDate(b.date)} · {TIME_SLOTS[b.slot] ?? `slot ${b.slot}`}
                    {past && <span className="ml-2 text-xs font-normal text-stone-500">(prošlo)</span>}
                  </p>
                  <p className="text-sm text-stone-600 mt-0.5">{b.napomena || <span className="italic text-stone-400">bez napomene</span>}</p>
                  {conflicts.length > 0 && (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
                      <p className="font-medium text-red-800">Treba premestiti ({conflicts.length}):</p>
                      <ul className="mt-1 space-y-0.5">
                        {conflicts.map((c) => (
                          <li key={c.id}>
                            <Link href={c.href} className="text-red-700 hover:underline">
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-sm">
                  <Link href={`/admin/kalendar?view=nedelja&week=${getMonday(b.date)}`} className="text-amber-700 hover:underline">
                    Kalendar →
                  </Link>
                  <UnblockButton id={b.id} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
