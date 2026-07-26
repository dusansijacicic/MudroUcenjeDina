import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import TermTypesForm from './TermTypesForm';
import DeleteTermTypeButton from './DeleteTermTypeButton';
import { getPrograms } from '@/app/admin/actions';

export default async function AdminVrsteTerminaPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const adminSupabase = createAdminClient();
  const [{ data: rows }, programs] = await Promise.all([
    adminSupabase.from('term_types').select('id, naziv, opis, cena_po_casu, program_id').order('naziv'),
    getPrograms(),
  ]);
  const programNazivById = new Map(programs.map((p) => [p.id, p.naziv]));

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Vrste termina</h1>
      <p className="text-stone-500 text-sm mb-6">
        Dodajte vrste termina (npr. individualni, grupa) i cenu po času. One se mogu dodeliti radionicama. Svaka vrsta pripada
        jednom programu (Admin → Programi).
      </p>
      <TermTypesForm programs={programs} />
      <div className="mt-6 rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {(rows ?? []).length === 0 ? (
          <div className="p-6 text-center text-stone-500">Nema vrsta. Dodajte prvu.</div>
        ) : (
          (rows ?? []).map((r) => (
            <TermTypeRow
              key={r.id}
              id={r.id}
              naziv={r.naziv ?? ''}
              opis={r.opis}
              cenaPoCasu={r.cena_po_casu}
              programNaziv={r.program_id ? programNazivById.get(r.program_id) ?? null : null}
            />
          ))
        )}
      </div>
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">← Nazad na admin</Link>
      </p>
    </div>
  );
}

function TermTypeRow({
  id,
  naziv,
  opis,
  cenaPoCasu,
  programNaziv,
}: {
  id: string;
  naziv: string;
  opis: string | null;
  cenaPoCasu?: number | null;
  programNaziv?: string | null;
}) {
  return (
    <div className="p-4 flex items-center justify-between gap-4">
      <div>
        <p className="font-medium text-stone-800">{naziv}</p>
        {opis && <p className="text-sm text-stone-600 mt-0.5">{opis}</p>}
        {cenaPoCasu != null && (
          <p className="text-sm text-amber-700 mt-0.5">{Number(cenaPoCasu).toLocaleString('sr-Latn-RS')} RSD / čas</p>
        )}
        <p className="text-xs text-stone-500 mt-0.5">
          Program: {programNaziv ?? <span className="text-stone-400">nije izabran</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/admin/vrste-termina/${id}`} className="text-sm text-amber-600 hover:underline">Izmeni</Link>
        <DeleteTermTypeButton id={id} />
      </div>
    </div>
  );
}

