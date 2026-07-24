import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import PotencijalniKlijentEditForm from './PotencijalniKlijentEditForm';
import type { PotentialClientRow } from '@/app/admin/actions';

export default async function PotencijalniKlijentPage({
  params,
}: {
  params: Promise<{ id: string; pcId: string }>;
}) {
  const { id: termId, pcId } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const admin = createAdminClient();
  const { data: pc } = await admin.from('potential_clients').select('*').eq('id', pcId).single();
  if (!pc) notFound();

  return (
    <div className="max-w-md">
      <Link href={`/admin/termin/${termId}`} className="text-sm text-stone-500 hover:text-amber-600 inline-block mb-4">
        ← Nazad na termin
      </Link>
      <h1 className="text-xl font-semibold text-stone-800 mb-1">{pc.ime}{pc.prezime ? ` ${pc.prezime}` : ''}</h1>
      <p className="text-stone-500 text-sm mb-6">Izmena podataka i statusa potencijalnog klijenta.</p>
      <PotencijalniKlijentEditForm termId={termId} pc={pc as PotentialClientRow} />
    </div>
  );
}
