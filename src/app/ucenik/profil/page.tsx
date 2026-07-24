import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Client } from '@/types/database';
import UcenikProfilForm from './UcenikProfilForm';

export default async function UcenikProfilPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: clientRow } = await admin.from('clients').select('*').eq('user_id', user.id).maybeSingle();
  if (!clientRow) redirect('/login');

  const client = clientRow as Client;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[var(--kid-text)]">Moj profil</h1>
      <p className="text-[var(--kid-text-muted)] text-sm">
        {client.ime} {client.prezime}
      </p>
      <UcenikProfilForm client={client} />
    </div>
  );
}
