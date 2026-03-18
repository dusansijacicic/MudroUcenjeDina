import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import AdminClientForm from './AdminClientForm';
import type { Client } from '@/types/database';

export default async function AdminKlijentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();
  if (!admin) redirect('/login');

  const adminSupabase = createAdminClient();
  const { data: client, error } = await adminSupabase
    .from('clients')
    .select('*, popust_percent')
    .eq('id', clientId)
    .single();

  if (error || !client) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-stone-800 mb-2">
        Izmena klijenta – {client.ime} {client.prezime}
      </h1>
      <p className="text-stone-500 text-sm mb-6">
        Super admin izmena. Plaćeno časova po predavaču se menja kod predavača (Predavači → izaberi → Klijenti).
      </p>
      <AdminClientForm client={client as Client} redirectAfterSave="/admin/klijenti" />
      <p className="mt-4">
        <Link href="/admin/klijenti" className="text-sm text-amber-700 hover:underline">
          ← Nazad na sve klijente
        </Link>
      </p>
    </div>
  );
}
