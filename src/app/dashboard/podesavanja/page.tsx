import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDashboardInstructor } from '@/lib/dashboard';
import PodesavanjaForm from './PodesavanjaForm';
import VelicinaSlovaIzbor from '@/components/VelicinaSlovaIzbor';
import { VELICINA_SLOVA_COOKIE, velicinaSlova } from '@/lib/velicina-slova';
import { cookies } from 'next/headers';
import type { Instructor } from '@/types/database';

const DAY_NAMES: Record<number, string> = {
  1: 'Ponedeljak',
  2: 'Utorak',
  3: 'Sreda',
  4: 'Četvrtak',
  5: 'Petak',
  6: 'Subota',
  7: 'Nedelja',
};

export default async function PodesavanjaPage() {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  let availabilityRows: { day_of_week: number; slot_index: number }[] = [];
  try {
    const adminSupabase = createAdminClient();
    const { data } = await adminSupabase
      .from('instructor_weekly_availability')
      .select('day_of_week, slot_index')
      .eq('instructor_id', instructor.id);
    availabilityRows = (data ?? []) as { day_of_week: number; slot_index: number }[];
  } catch {
    const supabase = await createClient();
    const { data } = await supabase
      .from('instructor_weekly_availability')
      .select('day_of_week, slot_index')
      .eq('instructor_id', instructor.id);
    availabilityRows = (data ?? []) as { day_of_week: number; slot_index: number }[];
  }

  const initialAvailability: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const row of availabilityRows) {
    const d = row.day_of_week as number;
    if (initialAvailability[d]) initialAvailability[d].push(row.slot_index as number);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Podešavanja
      </h1>
      <PodesavanjaForm
        instructor={instructor as Instructor}
        dayNames={DAY_NAMES}
        initialAvailability={initialAvailability}
      />

      <section className="mt-8 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-800">Veličina slova</h2>
        <p className="text-sm text-stone-500 mt-1 mb-3">Za ovaj uređaj – npr. veća slova na tabletu, normalna na računaru.</p>
        <VelicinaSlovaIzbor pocetna={velicinaSlova((await cookies()).get(VELICINA_SLOVA_COOKIE)?.value).kljuc} />
      </section>
    </div>
  );
}
