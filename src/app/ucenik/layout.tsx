import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import type { Client } from '@/types/database';
import UcenikNav from './UcenikNav';
import UcenikPovezivanje from './UcenikPovezivanje';

export default async function UcenikLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  let client: Client | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from('clients').select('*').eq('user_id', user.id).maybeSingle();
    client = data as Client | null;
  } catch {
    const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).single();
    client = data as Client | null;
  }

  if (!client) {
    return <UcenikPovezivanje />;
  }

  return (
    <div className="ucenik-layout min-h-screen bg-gradient-to-b from-[var(--kid-butter)] via-[#d6eaf880] to-[#ffe5d966]">
      <UcenikNav client={client} />
      <main className="max-w-3xl mx-auto px-4 py-6 animate-in">{children}</main>
    </div>
  );
}
