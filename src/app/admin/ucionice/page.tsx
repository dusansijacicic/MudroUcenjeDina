import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ClassroomForm from './ClassroomForm';
import DeleteClassroomButton from './DeleteClassroomButton';

export default async function AdminUcionicePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: rows } = await adminSupabase
    .from('classrooms')
    .select('id, naziv, color')
    .order('naziv');

  const classrooms = (rows ?? []) as { id: string; naziv: string; color: string | null }[];

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Učionice</h1>
      <p className="text-stone-500 text-sm mb-6">
        Dodajte ili izmenite učionice (sobe). Boja učionice koristi se za border blokova u admin kalendaru.
      </p>

      <ClassroomForm />

      <div className="mt-6 rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {classrooms.length === 0 ? (
          <div className="p-6 text-center text-stone-500">
            Nema učionica. Dodajte prvu.
          </div>
        ) : (
          classrooms.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="inline-block h-6 w-6 rounded border border-stone-300"
                  style={{ backgroundColor: r.color ?? '#e5e7eb' }}
                />
                <div className="min-w-0">
                  <p className="font-medium text-stone-800 truncate">{r.naziv}</p>
                  {r.color && (
                    <p className="text-xs text-stone-500 truncate">
                      {r.color}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/ucionice/${r.id}`}
                  className="text-xs text-amber-700 hover:text-amber-800 border border-amber-200 rounded-lg px-2 py-1 font-medium"
                >
                  Izmeni
                </Link>
                <DeleteClassroomButton id={r.id} />
              </div>
            </div>
          ))
        )}
      </div>

      <p className="mt-4">
        <Link
          href="/admin"
          className="text-sm text-amber-700 hover:underline"
        >
          ← Nazad na admin
        </Link>
      </p>
    </div>
  );
}

