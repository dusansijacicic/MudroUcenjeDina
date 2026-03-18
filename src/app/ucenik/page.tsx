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

  const { data: links } = await admin
    .from('instructor_clients')
    .select('instructor_id, placeno_casova')
    .eq('client_id', client.id);

  const { data: predavanjaRaw } = await admin
    .from('predavanja')
    .select('*, term:terms(date, slot_index, instructor_id, instructor:instructors(ime, prezime))')
    .eq('client_id', client.id);

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

  const odrzanoCount = list.filter((p) => p.odrzano).length;
  const placenoCount = list.filter((p) => p.placeno).length;
  const odrzanoIPlacenoCount = list.filter((p) => p.odrzano && p.placeno).length;
  const placenoCasovaUkupno = (links ?? []).reduce((s, l) => s + (l.placeno_casova ?? 0), 0);

  const preostaloUkupno = placenoCasovaUkupno - odrzanoCount;

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
            Predavač je potvrdio ili promenio vaš zahtev. Pogledajte <strong>Vaše zahteve</strong> ispod (označeno „Novo”) i listu <strong>Moji časovi</strong>.
          </p>
        </div>
      )}

      <section className="rounded-2xl border-2 border-[var(--kid-sky-dark)]/50 bg-white/90 backdrop-blur-sm p-6 shadow-lg transition-smooth hover:shadow-xl animate-in-delay-1" aria-labelledby="pregled-casova">
        <h2 id="pregled-casova" className="text-lg font-semibold text-[var(--kid-text)] mb-4">
          Pregled časova
        </h2>
        <p className="text-sm text-[var(--kid-text-muted)] mb-4">
          Ukupno koliko ste platili, koliko je održano, koliko je označeno kao plaćeno, koliko je održano i plaćeno i koliko časova vam preostaje.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl bg-[var(--kid-butter)] p-4 border border-[var(--kid-butter-dark)]/50 transition-smooth hover-lift">
            <p className="text-sm text-[var(--kid-text-muted)]">Ukupno plaćeno časova</p>
            <p className="text-2xl font-bold text-[var(--kid-text)]">
              {placenoCasovaUkupno}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--kid-mint)] p-4 border border-[var(--kid-mint-dark)]/50 transition-smooth hover-lift">
            <p className="text-sm text-[var(--kid-text-muted)]">Održano</p>
            <p className="text-2xl font-bold text-[var(--kid-text)]">
              {odrzanoCount}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--kid-lavender)] p-4 border border-[var(--kid-lavender-dark)]/50 transition-smooth hover-lift">
            <p className="text-sm text-[var(--kid-text-muted)]">Oznaka plaćeno</p>
            <p className="text-2xl font-bold text-[var(--kid-text)]">
              {placenoCount}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--kid-teal)]/40 p-4 border border-[var(--kid-teal)]/60 transition-smooth hover-lift">
            <p className="text-sm text-[var(--kid-text-muted)]">Održano i plaćeno</p>
            <p className="text-2xl font-bold text-[var(--kid-text)]">
              {odrzanoIPlacenoCount}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--kid-sky)] p-4 border border-[var(--kid-sky-dark)]/50 transition-smooth hover-lift">
            <p className="text-sm text-[var(--kid-text-muted)]">Preostalo časova</p>
            <p className="text-2xl font-bold text-[var(--kid-text)]">
              {preostaloUkupno}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--kid-text-muted)]">
          Preostalo = ukupno plaćeno − održano (računa se posebno po svakom predavaču, pa se zbraja).
        </p>
      </section>

      {(zahteviRaw?.length ?? 0) > 0 && (
        <section className="rounded-2xl border-2 border-[var(--kid-peach)] bg-white/90 backdrop-blur-sm p-6 shadow-lg transition-smooth hover:shadow-xl animate-in-delay-2" aria-labelledby="vasi-zahtevi">
          <h2 id="vasi-zahtevi" className="text-lg font-semibold text-[var(--kid-text)] mb-4">
            Vaši zahtevi za čas
          </h2>
          <p className="text-sm text-[var(--kid-text-muted)] mb-3">
            Zahtevi koje ste poslali; predavač može da potvrdi, promeni termin ili odbije.
          </p>
          <ul className="divide-y divide-[var(--kid-peach)]/50">
            {((zahteviRaw ?? []) as unknown[]).map((z: unknown) => {
              const row = z as { id: string; requested_date: string; requested_slot_index: number; status: string; instructor?: { ime: string; prezime: string } | { ime: string; prezime: string }[] | null; note_from_instructor?: string | null; created_at: string; resolved_at?: string | null };
              const instr = row.instructor && !Array.isArray(row.instructor) ? row.instructor : (Array.isArray(row.instructor) ? row.instructor[0] : null);
              const dateStr = String(row.requested_date).slice(0, 10);
              const timeStr = TIME_SLOTS[row.requested_slot_index] ?? '—';
              const inst = instr ? `${instr.ime} ${instr.prezime}` : 'Bilo koji predavač';
              const statusLabel = row.status === 'pending' ? 'Na čekanju' : row.status === 'confirmed' ? 'Potvrđen' : row.status === 'changed' ? 'Termin promenjen' : 'Odbijen';
              const isNew = (row.status === 'confirmed' || row.status === 'changed') && row.resolved_at &&
                (now - new Date(row.resolved_at).getTime() < sevenDaysMs);
              return (
                <li key={row.id} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-[var(--kid-text)]">{dateStr} • {timeStr}</span>
                    <div className="flex items-center gap-2">
                      {isNew && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--kid-teal)]/60 text-[#0d5c52] font-medium">
                          Novo
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        row.status === 'pending' ? 'bg-[var(--kid-butter)] text-[#b7950b]' :
                        row.status === 'confirmed' ? 'bg-[var(--kid-mint)] text-[#1e5631]' :
                        row.status === 'changed' ? 'bg-[var(--kid-sky)] text-[#1a5276]' : 'bg-[var(--kid-lavender)]/60 text-[var(--kid-text-muted)]'
                      }`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--kid-text)]">Predavač: {inst}</p>
                  {row.note_from_instructor && (
                    <p className="text-sm text-[var(--kid-text-muted)] mt-1">Napomena: {row.note_from_instructor}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="animate-in-delay-3" aria-labelledby="moji-casovi">
        <h2 id="moji-casovi" className="text-lg font-semibold text-[var(--kid-text)] mb-3">
          Moji časovi – ko je držao termin i šta je rađeno sa detetom
        </h2>
        <p className="text-sm text-[var(--kid-text-muted)] mb-4">
          Za svaki termin: datum i vreme, <strong>ko je predavač držao čas</strong>, da li je održano/plaćeno i <strong>šta je rađeno sa detetom</strong> (komentar predavača).
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
