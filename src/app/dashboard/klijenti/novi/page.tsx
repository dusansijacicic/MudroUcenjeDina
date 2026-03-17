import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ClientForm from '../ClientForm';

export default async function NoviKlijentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!instructor) redirect('/login');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">Novi klijent</h1>
      <ClientForm instructorId={instructor.id} />
    </div>
  );
}
