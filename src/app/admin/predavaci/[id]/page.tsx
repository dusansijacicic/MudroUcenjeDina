import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { TIME_SLOTS, getSlotEndTime } from '@/lib/constants';
import { beogradIso, danasBeograd, datumBeograd, jeIsoDatum } from '@/lib/datum';
import { sviRedovi } from '@/lib/svi-redovi';
import {
  periodi,
  statistikaInstruktora,
  type IstorijaStavka,
  type StatOtkazan,
  type StatTermin,
  type StatUplata,
} from '@/lib/statistika-instruktora';
import AdminPredavacEditForm from './AdminPredavacEditForm';

/** Čas je prošao (kraj bloka po beogradskom vremenu). */
function jeProslo(datum: string, slot: number): boolean {
  return new Date(beogradIso(datum, getSlotEndTime(slot))).getTime() < Date.now();
}

function sledeciDan(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const rsd = (n: number) => `${Math.round(n).toLocaleString('sr-Latn-RS')} RSD`;
const datumLepo = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' });
const datumKratko = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'numeric', year: 'numeric' });
const MESECI = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
const mesecLepo = (m: string) => `${MESECI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}.`;

const STATUS: Record<IstorijaStavka['status'], { tekst: string; klasa: string }> = {
  odrzan: { tekst: 'Održan', klasa: 'bg-emerald-100 text-emerald-800' },
  zakazan: { tekst: 'Zakazan', klasa: 'bg-amber-100 text-amber-900' },
  testiranje: { tekst: 'Testiranje', klasa: 'bg-red-50 text-red-700' },
  'otkazan-naplacen': { tekst: 'Otkazan · naplaćen', klasa: 'bg-indigo-100 text-indigo-800' },
  otkazan: { tekst: 'Otkazan · nije naplaćen', klasa: 'bg-stone-200 text-stone-700' },
};

const ISTORIJA_NAJVISE = 300;

export default async function AdminPredavacProfilPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; od?: string; do?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  // Period: sopstveni (od–do) ili jedan od ponuđenih; podrazumevano ovaj mesec.
  const danas = danasBeograd();
  const ponudjeni = periodi(danas);
  const sopstveni = !!sp.od && !!sp.do && jeIsoDatum(sp.od) && jeIsoDatum(sp.do) && sp.od <= sp.do;
  const izabrani = sopstveni ? null : ponudjeni.find((p) => p.kljuc === sp.period) ?? ponudjeni[0];
  const od = sopstveni ? (sp.od as string) : izabrani!.od;
  const doDatuma = sopstveni ? (sp.do as string) : izabrani!.do;

  const admin = createAdminClient();
  const [{ data: instructor }, termini, otkazani, uplate, { data: vrste }] = await Promise.all([
    admin.from('instructors').select('id, ime, prezime, telefon, color, email, aktivan').eq('id', id).single(),
    sviRedovi((a, b) =>
      admin
        .from('terms')
        .select(
          'id, date, slot_index, classroom:classrooms(naziv), term_category:term_categories(is_testing, is_nastavak), predavanja(id, client_id, odrzano, client:clients(ime, prezime, popust_percent), term_type:term_types(naziv, cena_po_casu)), potential_clients(id)'
        )
        .eq('instructor_id', id)
        .gte('date', od)
        .lte('date', doDatuma)
        .order('date')
        .order('slot_index')
        .order('id')
        .range(a, b)
    ),
    sviRedovi((a, b) =>
      admin.from('otkazani_termini').select('*').eq('instructor_id', id).gte('term_date', od).lte('term_date', doDatuma).order('term_date').order('id').range(a, b)
    ),
    sviRedovi((a, b) =>
      admin
        .from('uplate')
        .select('id, created_at, iznos, broj_casova, client:clients(ime, prezime), term_type:term_types(naziv)')
        .eq('instructor_id', id)
        .gte('created_at', beogradIso(od, '00:00'))
        .lt('created_at', beogradIso(sledeciDan(doDatuma), '00:00'))
        .order('created_at', { ascending: false })
        .order('id')
        .range(a, b)
    ),
    admin.from('term_types').select('naziv, cena_po_casu'),
  ]);
  if (!instructor) notFound();

  const cenePoNazivu = new Map(
    ((vrste ?? []) as { naziv: string; cena_po_casu: number | null }[])
      .filter((v) => v.cena_po_casu != null)
      .map((v) => [v.naziv, Number(v.cena_po_casu)])
  );
  const st = statistikaInstruktora({
    termini: termini as unknown as StatTermin[],
    otkazani: otkazani as unknown as StatOtkazan[],
    uplate: uplate as unknown as StatUplata[],
    cenePoNazivu,
    jeProslo,
    mesecUplate: (createdAt) => datumBeograd(createdAt).slice(0, 7),
  });
  const uplateLista = uplate as unknown as StatUplata[];
  const jedan = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] : v) ?? null;
  const periodNaziv = izabrani && izabrani.kljuc !== 'sve' ? `${izabrani.naziv.toLowerCase()} (${datumKratko(od)} – ${datumKratko(doDatuma)})` : izabrani ? 'ceo period' : `${datumKratko(od)} – ${datumKratko(doDatuma)}`;

  const plocice: { naslov: string; vrednost: string; ispod?: string; boja: string }[] = [
    {
      naslov: 'Održano časova',
      vrednost: String(st.odrzanoCasova),
      ispod: st.odrzanoDeceCasova !== st.odrzanoCasova ? `${st.odrzanoDeceCasova} po deci (grupe)` : undefined,
      boja: '#059669',
    },
    { naslov: 'Zakazano (još nije održano)', vrednost: String(st.zakazanoCasova), boja: '#d97706' },
    {
      naslov: 'Otkazano',
      vrednost: String(st.otkazanoNaplaceno + st.otkazanoNenaplaceno),
      ispod: `${st.otkazanoNaplaceno} naplaćeno · ${st.otkazanoNenaplaceno} nije`,
      boja: '#6366f1',
    },
    { naslov: 'Testiranja', vrednost: String(st.testiranja), ispod: st.testiranoDece ? `${st.testiranoDece} dece` : undefined, boja: '#dc2626' },
    { naslov: 'Različite dece', vrednost: String(st.razliciteDece), boja: '#0284c7' },
    {
      naslov: 'Vrednost održanih časova',
      vrednost: rsd(st.vrednostOdrzanih),
      ispod: st.vrednostNaplacenihOtkazanih ? `+ naplaćeni otkazani ${rsd(st.vrednostNaplacenihOtkazanih)}` : 'cena vrste, sa popustom deteta',
      boja: '#059669',
    },
    {
      naslov: 'Primljene uplate',
      vrednost: rsd(st.uplateIznos),
      ispod: `${st.uplateBroj} uplata · ${st.uplateCasova} časova`,
      boja: '#7c3aed',
    },
  ];

  return (
    <div className="max-w-5xl space-y-8">
      {/* Zaglavlje */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/predavaci" className="text-sm text-stone-500 hover:text-amber-600 inline-block mb-1">
            ← Svi instruktori
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-900 tracking-tight">
            <span aria-hidden="true" className="h-4 w-4 rounded-full" style={{ backgroundColor: instructor.color ?? '#0d9488' }} />
            {instructor.ime} {instructor.prezime}
            {instructor.aktivan === false && (
              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">Suspendovan</span>
            )}
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">Profil instruktora · statistika, istorija časova i izmena podataka</p>
        </div>
        <Link href={`/admin/view/${instructor.id}`} className="text-sm font-medium text-amber-700 hover:text-amber-800">
          Kalendar instruktora →
        </Link>
      </div>

      {/* Period */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          {ponudjeni.map((p) => {
            const aktivan = izabrani?.kljuc === p.kljuc;
            return (
              <Link
                key={p.kljuc}
                href={`/admin/predavaci/${id}?period=${p.kljuc}`}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  aktivan ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {p.naziv}
              </Link>
            );
          })}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <label htmlFor="period-od" className="flex flex-col gap-1 text-stone-600">
            Od
            <input id="period-od" type="date" name="od" defaultValue={od} className="rounded-lg border border-stone-300 px-2 py-1.5 text-stone-800" />
          </label>
          <label htmlFor="period-do" className="flex flex-col gap-1 text-stone-600">
            Do
            <input id="period-do" type="date" name="do" defaultValue={doDatuma} className="rounded-lg border border-stone-300 px-2 py-1.5 text-stone-800" />
          </label>
          <button type="submit" className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700">
            Prikaži
          </button>
          <span className="text-stone-500">Prikazano: {periodNaziv}</span>
        </form>
      </section>

      {/* Brojke */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {plocice.map((p) => (
          <div key={p.naslov} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" style={{ borderTop: `4px solid ${p.boja}` }}>
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{p.naslov}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">{p.vrednost}</div>
            {p.ispod && <div className="mt-0.5 text-xs text-stone-500">{p.ispod}</div>}
          </div>
        ))}
      </section>
      <p className="-mt-5 text-xs text-stone-500">
        Čas = termin sa decom (grupa je jedan čas). Održan = označen ili mu je vreme prošlo. Vrednost = cena po času vrste umanjena za popust
        deteta, za svako dete. Primljene uplate = novac koji je ovaj instruktor primio (Evidencija uplata) u periodu.
      </p>

      {/* Po vrstama */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Po vrstama časova</h2>
          <p className="text-xs text-stone-500 mt-0.5">Broji se po detetu (u grupi sa 3 deteta – 3).</p>
        </div>
        {st.poVrstama.length === 0 ? (
          <p className="p-5 text-sm text-stone-500">U ovom periodu nema časova.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-stone-600">
                <tr>
                  <th className="p-3 font-medium">Vrsta časa</th>
                  <th className="p-3 text-right font-medium">Održano</th>
                  <th className="p-3 text-right font-medium">Zakazano</th>
                  <th className="p-3 text-right font-medium">Vrednost održanih</th>
                </tr>
              </thead>
              <tbody>
                {st.poVrstama.map((v) => (
                  <tr key={v.naziv} className="border-t border-stone-100">
                    <td className="p-3 font-medium text-stone-800">{v.naziv}</td>
                    <td className="p-3 text-right tabular-nums">{v.odrzano}</td>
                    <td className="p-3 text-right tabular-nums text-stone-500">{v.zakazano}</td>
                    <td className="p-3 text-right tabular-nums">{v.vrednost ? rsd(v.vrednost) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Po mesecima */}
      {st.poMesecima.length > 1 && (
        <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
            <h2 className="text-base font-semibold text-stone-800">Po mesecima</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-stone-600">
                <tr>
                  <th className="p-3 font-medium">Mesec</th>
                  <th className="p-3 text-right font-medium">Održano časova</th>
                  <th className="p-3 text-right font-medium">Vrednost</th>
                  <th className="p-3 text-right font-medium">Primljene uplate</th>
                </tr>
              </thead>
              <tbody>
                {st.poMesecima.map((m) => (
                  <tr key={m.mesec} className="border-t border-stone-100">
                    <td className="p-3 font-medium capitalize text-stone-800">{mesecLepo(m.mesec)}</td>
                    <td className="p-3 text-right tabular-nums">{m.odrzano}</td>
                    <td className="p-3 text-right tabular-nums">{m.vrednost ? rsd(m.vrednost) : '—'}</td>
                    <td className="p-3 text-right tabular-nums">{m.uplate ? rsd(m.uplate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Uplate */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Primljene uplate ({st.uplateBroj})</h2>
        </div>
        {uplateLista.length === 0 ? (
          <p className="p-5 text-sm text-stone-500">U ovom periodu instruktor nije primio uplate.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {uplateLista.map((u) => {
              const c = jedan(u.client);
              return (
                <li key={u.id}>
                  <Link href={`/admin/uplate/${u.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 hover:bg-stone-50">
                    <span className="tabular-nums text-stone-500">{datumKratko(datumBeograd(u.created_at))}</span>
                    <span className="font-medium text-stone-800">{`${c?.ime ?? ''} ${c?.prezime ?? ''}`.trim() || '—'}</span>
                    <span className="text-stone-500">
                      {jedan(u.term_type)?.naziv ?? 'bez vrste'}
                      {u.broj_casova ? ` · ${u.broj_casova} čas.` : ''}
                    </span>
                    <span className="ml-auto font-semibold tabular-nums text-stone-900">{rsd(Number(u.iznos ?? 0))}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Istorija časova */}
      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-stone-100 bg-stone-50/80 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-800">Istorija časova ({st.istorija.length})</h2>
          <p className="text-xs text-stone-500 mt-0.5">Najnoviji prvi. Klik otvara termin.</p>
        </div>
        {st.istorija.length === 0 ? (
          <p className="p-5 text-sm text-stone-500">U ovom periodu nema časova.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {st.istorija.slice(0, ISTORIJA_NAJVISE).map((h) => {
              const sadrzaj = (
                <>
                  <span className="w-40 shrink-0 tabular-nums text-stone-600">
                    {datumLepo(h.datum)} <span className="font-medium text-stone-800">{TIME_SLOTS[h.slot] ?? ''}</span>
                  </span>
                  <span className={`min-w-0 flex-1 font-medium ${h.status.startsWith('otkazan') ? 'text-stone-500 line-through' : 'text-stone-900'}`}>
                    {h.deca}
                  </span>
                  <span className="text-stone-500">
                    {h.vrsta}
                    {h.ucionica ? ` · ${h.ucionica}` : ''}
                    {h.razlog ? ` · ${h.razlog}` : ''}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[h.status].klasa}`}>{STATUS[h.status].tekst}</span>
                  <span className="w-24 text-right tabular-nums text-stone-700">{h.vrednost != null ? rsd(h.vrednost) : ''}</span>
                </>
              );
              return (
                <li key={h.kljuc}>
                  {h.termId ? (
                    <Link href={`/admin/termin/${h.termId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 hover:bg-stone-50">
                      {sadrzaj}
                    </Link>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">{sadrzaj}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {st.istorija.length > ISTORIJA_NAJVISE && (
          <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">
            Prikazano poslednjih {ISTORIJA_NAJVISE} od {st.istorija.length}. Suzite period za stariji deo istorije.
          </p>
        )}
      </section>

      {/* Izmena podataka */}
      <section className="max-w-lg rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-stone-800 mb-1">Izmena podataka</h2>
        <p className="text-stone-500 text-sm mb-4">Ime, telefon i boja u kalendaru.</p>
        <AdminPredavacEditForm instructor={{ id: instructor.id, ime: instructor.ime, prezime: instructor.prezime, telefon: instructor.telefon, color: instructor.color }} />
      </section>
    </div>
  );
}
