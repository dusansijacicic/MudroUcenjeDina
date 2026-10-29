import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import UplataForm from '../novi/UplataForm';
import ObrisiUplatuButton from '../ObrisiUplatuButton';
import { getTermTypes } from '@/app/admin/actions';
import { datumBeograd } from '@/lib/datum';

export default async function AdminUplataIzmenaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  if (!(await getIsAdmin())) redirect('/login');

  const adminSupabase = createAdminClient();
  const [{ data: uplata }, { data: instructors }, { data: clients }, termTypes] = await Promise.all([
    adminSupabase
      .from('uplate')
      .select('id, created_at, instructor_id, client_id, iznos, term_type_id, broj_casova, popust_percent, napomena, client:clients(ime, prezime)')
      .eq('id', id)
      .maybeSingle(),
    // Svi instruktori (i suspendovani) – da se postojeća uplata suspendovanog instruktora i dalje vidi ispravno.
    adminSupabase.from('instructors').select('id, ime, prezime, aktivan').order('prezime').order('ime'),
    adminSupabase.from('clients').select('id, ime, prezime, popust_percent').order('ime').order('prezime'),
    getTermTypes(),
  ]);
  if (!uplata) notFound();

  const instructorOptions = (instructors ?? [])
    .filter((i) => i.aktivan !== false || i.id === uplata.instructor_id)
    .map((i) => ({ id: i.id, ime: i.ime ?? '', prezime: i.prezime ?? '' }));
  const client = Array.isArray(uplata.client) ? uplata.client[0] : uplata.client;
  const opis = `${uplata.iznos != null ? `${Number(uplata.iznos).toLocaleString('sr-Latn-RS')} RSD` : 'bez iznosa'} za ${
    client ? `${client.ime} ${client.prezime}` : 'klijenta'
  } (${uplata.broj_casova} čas.)`;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 max-w-md">
        <div>
          <h1 className="text-xl font-semibold text-stone-800 mb-1">Izmena uplate</h1>
          <p className="text-stone-500 text-sm">Promena broja časova ili vrste odmah menja „x/y“ na kalendaru i stanje u profilu deteta.</p>
        </div>
        <ObrisiUplatuButton
          id={uplata.id}
          opis={opis}
          afterHref="/admin/uplate"
          className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        />
      </div>
      <UplataForm
        instructors={instructorOptions}
        clients={(clients ?? []).map((c) => ({ id: c.id, ime: c.ime ?? '', prezime: c.prezime ?? '', popust_percent: c.popust_percent ?? 0 }))}
        termTypes={termTypes.map((t) => ({ id: t.id, naziv: t.naziv, cena_po_casu: t.cena_po_casu ?? null }))}
        initial={{
          id: uplata.id,
          instructorId: uplata.instructor_id,
          clientId: uplata.client_id,
          iznos: uplata.iznos != null ? Number(uplata.iznos) : null,
          termTypeId: uplata.term_type_id,
          brojCasova: uplata.broj_casova ?? 0,
          popustPercent: uplata.popust_percent != null ? Number(uplata.popust_percent) : null,
          napomena: uplata.napomena,
          datum: datumBeograd(uplata.created_at ?? new Date()),
        }}
      />
      <p className="mt-4">
        <Link href="/admin/uplate" className="text-sm text-amber-700 hover:underline">← Nazad na evidenciju</Link>
      </p>
    </div>
  );
}
