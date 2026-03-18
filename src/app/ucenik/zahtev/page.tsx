import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ZahtevForm from './ZahtevForm';
import { TIME_SLOTS } from '@/lib/constants';

export default async function UcenikZahtevPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!client) redirect('/login');

  const { data: links } = await supabase
    .from('instructor_clients')
    .select('instructor_id, instructor:instructors(id, ime, prezime)')
    .eq('client_id', client.id);
  const instructors = (links ?? [])
    .map((l) => {
      const instr = (l as { instructor?: { id: string; ime: string; prezime: string } | { id: string; ime: string; prezime: string }[] }).instructor;
      return Array.isArray(instr) ? instr[0] : instr;
    })
    .filter(Boolean) as { id: string; ime: string; prezime: string }[];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  const { data: occupiedForDefault } = await supabase.rpc('get_occupied_slots', {
    p_date: defaultDate,
  });
  const defaultOccupiedSlots = (occupiedForDefault ?? []) as number[];

  if (instructors.length === 0) {
    return (
      <div className="max-w-lg animate-in">
        <h1 className="text-2xl font-bold text-[var(--kid-text)] mb-2">Zatraži zakazivanje časa</h1>
        <p className="text-[var(--kid-text-muted)] mb-4">
          Niste još povezani ni sa jednim predavačem. Predavač vas mora prvo dodati kao klijenta; onda možete slati zahteve za čas.
        </p>
        <Link href="/ucenik" className="inline-flex items-center gap-1 text-sm font-medium text-[#0d9488] hover:text-[#0f766e] transition-smooth hover:underline">← Nazad na Moj pregled</Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg animate-in">
      <h1 className="text-2xl font-bold text-[var(--kid-text)] mb-2">Zatraži zakazivanje časa</h1>
      <p className="text-[var(--kid-text-muted)] text-sm mb-6">
        Izaberi predavača (ili bilo kog), datum i vreme. Predavač će dobiti obaveštenje i moći će da potvrdi termin ili da predloži drugi.
      </p>
      <div className="rounded-2xl border-2 border-[var(--kid-sky-dark)]/50 bg-white/90 backdrop-blur-sm p-6 shadow-lg animate-in-delay-1">
        <ZahtevForm
          clientId={client.id}
          instructors={instructors}
          defaultDate={defaultDate}
          slotLabels={TIME_SLOTS}
          initialOccupiedSlots={defaultOccupiedSlots}
        />
      </div>
      <p className="mt-6 animate-in-delay-2">
        <Link href="/ucenik" className="inline-flex items-center gap-1 text-sm font-medium text-[#0d9488] hover:text-[#0f766e] transition-smooth hover:underline">← Nazad na Moj pregled</Link>
      </p>
    </div>
  );
}
