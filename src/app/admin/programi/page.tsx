import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ProgramiForm from './ProgramiForm';
import DeleteProgramButton from './DeleteProgramButton';

export default async function AdminProgramiPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: rows } = await adminSupabase.from('programi').select('id, naziv, opis').order('naziv');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Programi</h1>
      <p className="text-stone-500 text-sm mb-6">
        Opšte oblasti (npr. Čitanje, Matematika, Logoped, Učenje, Defektološki). Svaka Vrsta termina pripada tačno jednom programu
        (podešava se u Admin → Vrste termina).
      </p>
      <ProgramiForm />
      <div className="mt-6 rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {(rows ?? []).length === 0 ? (
          <div className="p-6 text-center text-stone-500">Nema programa. Dodajte prvi.</div>
        ) : (
          (rows ?? []).map((r) => (
            <div key={r.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-stone-800">{r.naziv}</p>
                {r.opis && <p className="text-sm text-stone-600 mt-0.5">{r.opis}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/admin/programi/${r.id}`} className="text-sm text-amber-600 hover:underline">
                  Izmeni
                </Link>
                <DeleteProgramButton id={r.id} />
              </div>
            </div>
          ))
        )}
      </div>
      <p className="mt-4">
        <Link href="/admin" className="text-sm text-amber-700 hover:underline">
          ← Nazad na admin
        </Link>
      </p>
    </div>
  );
}
