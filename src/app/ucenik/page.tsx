import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { TIME_SLOTS } from '@/lib/constants';
import type { Predavanje } from '@/types/database';

export default async function UcenikPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: client } = await admin.from('clients').select('*').eq('user_id', user.id).single();
  if (!client) redirect('/login');

  const [
    { data: uplateRaw },
    { data: predavanjaRaw },
    { data: termTypesRaw },
  ] = await Promise.all([
    admin
      .from('uplate')
      .select('id, created_at, iznos, broj_casova, popust_percent, napomena, instructor:instructors(ime, prezime), term_type:term_types(id, naziv)')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('predavanja')
      .select('*, term:terms(date, slot_index, instructor_id, instructor:instructors(ime, prezime))')
      .eq('client_id', client.id),
    admin.from('term_types').select('id, naziv, cena_po_casu').order('naziv'),
  ]);

  type TermWithInstructor = { date: string; slot_index: number; instructor_id?: string; instructor?: { ime: string; prezime: string } | null };
  const list = ((predavanjaRaw ?? []) as (Predavanje & { term?: TermWithInstructor | null })[])
    .sort((a, b) => {
      const dA = a.term?.date ?? '';
      const dB = b.term?.date ?? '';
      if (dA !== dB) return dB.localeCompare(dA);
      return (b.term?.slot_index ?? 0) - (a.term?.slot_index ?? 0);
    });

  const { data: zahteviRaw } = await admin
    .from('zahtevi_za_cas')
    .select('id, requested_date, requested_slot_index, status, instructor_id, instructor:instructors(ime, prezime), note_from_instructor, created_at, resolved_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recentConfirmedOrChanged = (zahteviRaw ?? []).filter(
    (z: { status: string; resolved_at?: string | null }) =>
      (z.status === 'confirmed' || z.status === 'changed') &&
      z.resolved_at &&
      now - new Date(z.resolved_at).getTime() < sevenDaysMs
  );
  const hasNewScheduledNotification = recentConfirmedOrChanged.length > 0;

  // Stanje po vrstama: iz uplata (uplaćeno) i iz održanih predavanja (iskorišćeno)
  type UplataListItem = {
    id: string;
    created_at: string | null;
    iznos: number | null;
    broj_casova: number | null;
    popust_percent: number | null;
    napomena: string | null;
    instructor: { ime?: string; prezime?: string } | null;
    term_type: { id?: string; naziv?: string } | null;
  };
  const uplateList: UplataListItem[] = (uplateRaw ?? []).map((u: Record<string, unknown>) => {
    const instr = Array.isArray(u.instructor) ? u.instructor[0] : u.instructor;
    const tt = Array.isArray(u.term_type) ? u.term_type[0] : u.term_type;
    const broj = typeof u.broj_casova === 'number' ? u.broj_casova : null;
    const iznos = typeof u.iznos === 'number' ? u.iznos : null;
    const popust = typeof u.popust_percent === 'number' ? u.popust_percent : null;
    return {
      id: (u.id as string) ?? '',
      created_at: (u.created_at as string | null) ?? null,
      iznos,
      broj_casova: broj,
      popust_percent: popust,
      napomena: (u.napomena as string | null) ?? null,
      instructor: instr as { ime?: string; prezime?: string } | null,
      term_type: tt as { id?: string; naziv?: string } | null,
    };
  });
  const termTypes = (termTypesRaw ?? []) as { id: string; naziv: string; cena_po_casu: number | null }[];
  type PredavanjeWithType = Predavanje & { term?: TermWithInstructor | null; term_type_id?: string | null };
  const odrzanoByType = new Map<string, number>();
  for (const p of list.filter((p) => p.odrzano) as PredavanjeWithType[]) {
    const tid = p.term_type_id ?? '__bez_vrste__';
    odrzanoByType.set(tid, (odrzanoByType.get(tid) ?? 0) + 1);
  }
  const uplacenoByType = new Map<string, number>();
  for (const u of uplateList) {
    const tid = u.term_type?.id ?? '__bez_vrste__';
    uplacenoByType.set(tid, (uplacenoByType.get(tid) ?? 0) + (u.broj_casova ?? 0));
  }
  const stanjePoTipuSve = termTypes.map((tt) => {
    const uplaceno = uplacenoByType.get(tt.id) ?? 0;
    const odrzano = odrzanoByType.get(tt.id) ?? 0;
    return {
      id: tt.id,
      naziv: tt.naziv,
      cena_po_casu: tt.cena_po_casu,
      uplaceno,
      odrzano,
      ostalo: Math.max(0, uplaceno - odrzano),
    };
  });
  if (uplacenoByType.has('__bez_vrste__') || odrzanoByType.has('__bez_vrste__')) {
    stanjePoTipuSve.push({
      id: '__bez_vrste__',
      naziv: 'Bez vrste',
      cena_po_casu: null,
      uplaceno: uplacenoByType.get('__bez_vrste__') ?? 0,
      odrzano: odrzanoByType.get('__bez_vrste__') ?? 0,
      ostalo: Math.max(0, (uplacenoByType.get('__bez_vrste__') ?? 0) - (odrzanoByType.get('__bez_vrste__') ?? 0)),
    });
  }

  const ukupnoUplacenoRsd = uplateList.reduce((sum, u) => sum + (u.iznos != null ? Number(u.iznos) : 0), 0);
  // Samo vrste gde ima makar jedan kupljen
  const stanjePoTipu = stanjePoTipuSve.filter((s) => s.uplaceno >= 1);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-[var(--kid-text)] animate-in">
        Zdravo, {client.ime}!
      </h1>
      <p className="text-[var(--kid-text-muted)] text-sm animate-in-delay-1">
        Ovde vidiš samo svoje zakazane časove i istoriju – nemaš pristup drugim podacima.
      </p>

      {hasNewScheduledNotification && (
        <div className="rounded-2xl border-2 border-[var(--kid-teal)] bg-[var(--kid-mint)] p-4 text-[#1e5631] shadow-md animate-in-delay-1" role="alert">
          <p className="font-medium">
            Imate novi(e) zakazani(e) čas(ove)
          </p>
          <p className="text-sm mt-1">
            Pogledajte listu <strong>Moji časovi</strong> ispod.
          </p>
        </div>
      )}

      <section className="rounded-2xl border-2 border-[var(--kid-sky)]/50 bg-white/90 backdrop-blur-sm p-6 shadow-lg transition-smooth hover:shadow-xl animate-in-delay-1" aria-labelledby="stanje-po-tipu">
        <h2 id="stanje-po-tipu" className="text-lg font-semibold text-[var(--kid-text)] mb-4">
          Stanje po vrstama časova
        </h2>
        <p className="text-sm text-[var(--kid-text-muted)] mb-4">
          Koliko ste uplatili, koliko je održano i koliko vam preostaje – samo vrste gde imate kupljene časove.
        </p>
        {stanjePoTipu.length === 0 ? (
          <p className="text-sm text-[var(--kid-text-muted)]">Nema kupljenih časova po vrstama. Kada uplatite, ovde će se prikazati.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stanjePoTipu.map((s) => (
              <div key={s.id} className="rounded-2xl border-2 border-[var(--kid-sky)]/50 bg-white p-5 shadow-md transition-smooth hover:shadow-lg hover:border-[var(--kid-teal)]/50">
                <div className="mb-3">
                  <p className="font-semibold text-[var(--kid-text)]">{s.naziv}</p>
                  {s.cena_po_casu != null && s.cena_po_casu > 0 ? (
                    <p className="text-sm text-[var(--kid-text-muted)] mt-1">
                      Cena po času:{' '}
                      <span className="font-medium text-[var(--kid-text)]">
                        {Number(s.cena_po_casu).toLocaleString('sr-Latn-RS')} RSD
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-[var(--kid-butter)]/50 p-2 border border-[var(--kid-butter-dark)]/40">
                    <p className="text-xs text-[var(--kid-text-muted)]">Uplaćeno</p>
                    <p className="text-lg font-bold text-[var(--kid-text)]">{s.uplaceno}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--kid-mint)]/50 p-2 border border-[var(--kid-mint-dark)]/40">
                    <p className="text-xs text-[var(--kid-text-muted)]">Održano</p>
                    <p className="text-lg font-bold text-[var(--kid-text)]">{s.odrzano}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--kid-sky)]/50 p-2 border border-[var(--kid-sky-dark)]/40">
                    <p className="text-xs text-[var(--kid-text-muted)]">Preostalo</p>
                    <p className="text-lg font-bold text-[var(--kid-text)]">{s.ostalo}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-4 animate-in-delay-2">
        <a
          href="/ucenik/kalendar"
          className="inline-flex items-center justify-center rounded-2xl bg-[var(--kid-teal)] px-6 py-3 text-white font-semibold shadow-lg transition-smooth hover:bg-[#0f766e] hover:shadow-xl hover:-translate-y-0.5"
        >
          Pogledaj moj kalendar
        </a>
      </div>

      <section className="rounded-2xl border-2 border-[var(--kid-lavender)]/50 bg-white/90 backdrop-blur-sm p-6 shadow-lg transition-smooth hover:shadow-xl animate-in-delay-1" aria-labelledby="vase-uplate">
        <h2 id="vase-uplate" className="text-lg font-semibold text-[var(--kid-text)] mb-4">
          Vaše uplate
        </h2>
        <p className="text-sm text-[var(--kid-text-muted)] mb-4">
          Istorija uplata: ko je primio, kada, iznos, vrsta časa i broj časova.
        </p>
        {uplateList.length > 0 && (
          <div className="mb-4 rounded-2xl border-2 border-[var(--kid-teal)]/40 bg-[var(--kid-mint)]/40 px-4 py-3">
            <p className="text-sm text-[var(--kid-text-muted)]">Ukupno uplaćeno (sve uplate)</p>
            <p className="text-xl font-bold text-[var(--kid-text)]">
              {ukupnoUplacenoRsd.toLocaleString('sr-Latn-RS')} RSD
            </p>
          </div>
        )}
        {uplateList.length === 0 ? (
          <p className="text-sm text-[var(--kid-text-muted)]">Nema zabeleženih uplata.</p>
        ) : (
          <ul className="divide-y divide-[var(--kid-lavender)]/40">
            {uplateList.map((u) => (
              <li key={u.id} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--kid-text)]">
                    {u.created_at
                      ? new Date(u.created_at).toLocaleDateString('sr-Latn-RS', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </span>
                  {u.iznos != null && (
                    <span className="text-sm font-semibold text-[var(--kid-text)]">
                      {Number(u.iznos).toLocaleString('sr-Latn-RS')} RSD
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--kid-text-muted)] mt-0.5">
                  Primio: {u.instructor ? `${u.instructor.ime} ${u.instructor.prezime}` : '—'}
                  {u.term_type?.naziv && ` · ${u.term_type.naziv}`}
                  {u.broj_casova != null && ` · ${u.broj_casova} časova`}
                  {u.popust_percent != null && u.popust_percent > 0 && ` · popust ${u.popust_percent}%`}
                </p>
                {u.napomena && <p className="text-xs text-[var(--kid-text-muted)] mt-1">{u.napomena}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sekcija "Vaši zahtevi" uklonjena – klijent ne vidi zakazivanje ni zahteve. */}

      <section className="animate-in-delay-3" aria-labelledby="moji-casovi">
        <h2 id="moji-casovi" className="text-lg font-semibold text-[var(--kid-text)] mb-3">
          Moji časovi – ko je držao termin i šta je rađeno sa detetom
        </h2>
        <p className="text-sm text-[var(--kid-text-muted)] mb-4">
          Za svaki termin: datum i vreme, <strong>ko je instruktor držao čas</strong>, da li je održano/plaćeno i <strong>šta je rađeno sa detetom</strong> (komentar instruktora).
        </p>
        <div className="rounded-2xl border-2 border-[var(--kid-lavender)]/60 bg-white/90 backdrop-blur-sm divide-y divide-[var(--kid-lavender)]/40 shadow-lg overflow-hidden">
          {list.length === 0 ? (
            <div className="p-8 text-center text-[var(--kid-text-muted)]">
              Nema zabeleženih časova.
            </div>
          ) : (
            list.map((p) => {
              const term = p.term as TermWithInstructor | null | undefined;
              const instructorName = term?.instructor
                ? `${term.instructor.ime} ${term.instructor.prezime}`
                : '—';
              const dateStr = term?.date
                ? new Date(term.date + 'T12:00:00').toLocaleDateString('sr-Latn-RS', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })
                : '—';
              const timeStr = term != null ? (TIME_SLOTS[term.slot_index] ?? '—') : '—';
              return (
                <div key={p.id} className="p-4 transition-smooth hover:bg-[var(--kid-butter)]/30">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-[var(--kid-text)]">
                      {dateStr} • {timeStr}
                    </span>
                    <div className="flex gap-2">
                      {p.odrzano && (
                        <span className="text-xs bg-[var(--kid-mint)] text-[#1e5631] px-2 py-0.5 rounded-full font-medium">
                          Održano
                        </span>
                      )}
                      {p.placeno && (
                        <span className="text-xs bg-[var(--kid-sky)] text-[#1a5276] px-2 py-0.5 rounded-full font-medium">
                          Plaćeno
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-[var(--kid-text)] mt-1">
                    <strong>Ko je držao termin:</strong> {instructorName}
                  </p>
                  {p.komentar ? (
                    <p className="mt-2 text-[var(--kid-text)] text-sm whitespace-pre-wrap bg-[var(--kid-butter)]/50 rounded-xl p-3 border border-[var(--kid-butter-dark)]/40">
                      <strong>Šta je rađeno sa detetom:</strong> {p.komentar}
                    </p>
                  ) : (
                    <p className="mt-2 text-[var(--kid-text-muted)] text-sm italic">Šta je rađeno sa detetom: nema opisa.</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
