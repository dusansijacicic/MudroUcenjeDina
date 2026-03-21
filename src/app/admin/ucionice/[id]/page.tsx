import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import ClassroomForm from '../ClassroomForm';
import DeleteClassroomButton from '../DeleteClassroomButton';

export default async function AdminUcionicaEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  const { data: row } = await adminSupabase.from('classrooms').select('id, naziv, color').eq('id', id).single();
  if (!row) notFound();

  const classroom = row as { id: string; naziv: string; color: string | null };

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Izmena učionice</h1>
      <p className="text-stone-500 text-sm mb-6">
        Promenite naziv ili boju. Termini koji koriste ovu učionicu automatski prate novu boju u kalendaru.
      </p>

      <ClassroomForm existing={classroom} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <DeleteClassroomButton id={classroom.id} />
        <Link href="/admin/ucionice" className="text-sm text-amber-700 hover:underline">
          ← Nazad na sve učionice
        </Link>
      </div>
    </div>
  );
}
