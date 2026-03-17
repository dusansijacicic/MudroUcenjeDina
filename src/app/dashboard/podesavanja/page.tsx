import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PodesavanjaForm from './PodesavanjaForm';
import type { Instructor } from '@/types/database';

export default async function PodesavanjaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: instructor } = await supabase
    .from('instructors')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!instructor) redirect('/login');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Podešavanja
      </h1>
      <PodesavanjaForm instructor={instructor as Instructor} />
    </div>
  );
}
