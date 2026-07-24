import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import UplataForm from './UplataForm';
import { getTermTypes } from '@/app/admin/actions';

export default async function AdminUplateNoviPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const adminSupabase = createAdminClient();
  const [{ data: instructors }, { data: clients }, termTypes] = await Promise.all([
    adminSupabase.from('instructors').select('id, ime, prezime').order('prezime').order('ime'),
    adminSupabase.from('clients').select('id, ime, prezime, popust_percent').order('prezime').order('ime'),
    getTermTypes(),
  ]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Unesi uplatu</h1>
      <p className="text-stone-500 text-sm mb-6">
        Evidencija: ko je primio novac (instruktor), za kog klijenta, iznos i koliko koje vrste časova.
      </p>
      <UplataForm
        instructors={(instructors ?? []).map((i) => ({ id: i.id, ime: i.ime ?? '', prezime: i.prezime ?? '' }))}
        clients={(clients ?? []).map((c) => ({ id: c.id, ime: c.ime ?? '', prezime: c.prezime ?? '', popust_percent: (c as { popust_percent?: number | null }).popust_percent ?? 0 }))}
        termTypes={termTypes.map((t) => ({ id: t.id, naziv: t.naziv, cena_po_casu: t.cena_po_casu ?? null }))}
      />
      <p className="mt-4">
        <Link href="/admin/uplate" className="text-sm text-amber-700 hover:underline">← Nazad na evidenciju</Link>
      </p>
    </div>
  );
}
