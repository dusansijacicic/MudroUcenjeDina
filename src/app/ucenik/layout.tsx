import { createClient } from '@/lib/supabase/server';
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

  let { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!client) {
    return <UcenikPovezivanje />;
  }

  return (
    <div className="ucenik-layout min-h-screen bg-gradient-to-b from-[var(--kid-butter)] via-[#d6eaf880] to-[#ffe5d966]">
      <UcenikNav client={client as Client} />
      <main className="max-w-3xl mx-auto px-4 py-6 animate-in">{children}</main>
    </div>
  );
}
