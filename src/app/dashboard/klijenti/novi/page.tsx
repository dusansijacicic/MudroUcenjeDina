import { redirect } from 'next/navigation';
import { getDashboardInstructor } from '@/lib/dashboard';
import ClientForm from '../ClientForm';

export default async function NoviKlijentPage() {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-4">Novi klijent</h1>
      <ClientForm instructorId={instructor.id} />
    </div>
  );
}
