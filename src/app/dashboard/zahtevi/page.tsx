import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getDashboardInstructor } from '@/lib/dashboard';
import { TIME_SLOTS } from '@/lib/constants';
import ZahteviList, { type Zahtev } from './ZahteviList';

export default async function DashboardZahteviPage() {
  const supabase = await createClient();
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const { data: zahtevi } = await supabase
    .from('zahtevi_za_cas')
    .select('id, client_id, instructor_id, requested_date, requested_slot_index, status, note_from_instructor, created_at, client:clients(ime, prezime)')
    .order('created_at', { ascending: false });

  const pending = (zahtevi ?? []).filter((z) => z.status === 'pending') as unknown as Zahtev[];
  const resolved = (zahtevi ?? []).filter((z) => z.status !== 'pending') as unknown as Zahtev[];

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-800 mb-2">Zahtevi za čas</h1>
      <p className="text-stone-500 text-sm mb-6">
        Klijenti su poslali zahteve za zakazivanje. Potvrdite termin, predložite drugi datum/vreme ili odbijte.
      </p>

      {pending.length === 0 ? (
        <p className="text-stone-500 text-sm">Trenutno nema zahteva na čekanju.</p>
      ) : (
        <ZahteviList
          zahtevi={pending}
          instructorId={instructor.id}
          slotLabels={TIME_SLOTS}
          isPending
        />
      )}

      {resolved.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-stone-500 mb-2">Rešeni zahtevi</h2>
          <ZahteviList
            zahtevi={resolved}
            instructorId={instructor.id}
            slotLabels={TIME_SLOTS}
            isPending={false}
          />
        </section>
      )}

      <p className="mt-6">
        <Link href="/dashboard" className="text-sm text-amber-700 hover:underline">← Kalendar</Link>
      </p>
    </div>
  );
}
