import { redirect } from 'next/navigation';
import { getDashboardInstructor } from '@/lib/dashboard';
import PodesavanjaForm from './PodesavanjaForm';
import type { Instructor } from '@/types/database';

export default async function PodesavanjaPage() {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">
        Podešavanja
      </h1>
      <PodesavanjaForm instructor={instructor as Instructor} />
    </div>
  );
}
