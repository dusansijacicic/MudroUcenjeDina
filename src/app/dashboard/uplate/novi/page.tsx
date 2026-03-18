import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getDashboardInstructor } from '@/lib/dashboard';
import { getTermTypes } from '@/app/admin/actions';
import UplataForm from '@/app/admin/uplate/novi/UplataForm';

export default async function DashboardUplateNoviPage() {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const admin = createAdminClient();
  const { data: linkRows } = await admin
    .from('instructor_clients')
    .select('client:clients(id, ime, prezime, popust_percent)')
    .eq('instructor_id', instructor.id);
  const clients = (linkRows ?? [])
    .map((r) => r.client)
    .filter(Boolean) as unknown as { id: string; ime: string; prezime: string; popust_percent?: number | null }[];
  clients.sort(
    (a, b) =>
      (a.prezime ?? '').localeCompare(b.prezime ?? '') || (a.ime ?? '').localeCompare(b.ime ?? '')
  );

  const termTypes = await getTermTypes();

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Unesi uplatu</h1>
      <p className="text-stone-500 text-sm mb-6">
        Unos uplate koju ste vi primili (za jednog od vaših klijenata).
      </p>
      <UplataForm
        instructors={[{ id: instructor.id, ime: instructor.ime ?? '', prezime: instructor.prezime ?? '' }]}
        clients={clients.map((c) => ({
          id: c.id,
          ime: c.ime ?? '',
          prezime: c.prezime ?? '',
          popust_percent: c.popust_percent ?? 0,
        }))}
        termTypes={termTypes.map((t) => ({ id: t.id, naziv: t.naziv }))}
        fixedInstructorId={instructor.id}
        backHref="/dashboard/uplate"
      />
      <p className="mt-4">
        <Link href="/dashboard/uplate" className="text-sm text-amber-700 hover:underline">
          ← Nazad na evidenciju
        </Link>
      </p>
    </div>
  );
}
