import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { danasBeograd } from '@/lib/datum';
import { kljucDanVreme, type KlijentZaUvoz } from '@/lib/uvoz-rasporeda';
import UvozRasporeda from './UvozRasporeda';

function pomeriDane(datum: string, dana: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dana);
  return d.toISOString().slice(0, 10);
}

export default async function UvozRasporedaPage() {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  if (!(await getIsAdmin())) redirect('/login');

  const admin = createAdminClient();
  const danas = danasBeograd();
  // "Obično dolazi": dan u nedelji + vreme iz časova i zahteva od 8 nedelja unazad do 4 unapred.
  const od = pomeriDane(danas, -56);
  const doDatuma = pomeriDane(danas, 28);

  const [klijentiRes, vrsteRes, instruktoriRes, ucioniceRes, imenaRes, terminiRes, zahteviRes] = await Promise.all([
    admin.from('clients').select('id, ime, prezime, godiste, razred, roditelj').order('ime').order('prezime').range(0, 4999),
    admin.from('term_types').select('id, naziv, trajanje_minuta').order('naziv'),
    admin.from('instructors').select('id, ime, prezime, aktivan').order('ime').order('prezime'),
    admin.from('classrooms').select('id, naziv').order('naziv'),
    // Bez migracije 053 tabela ne postoji → greška → nema zapamćenih imena.
    admin.from('uvoz_imena').select('ime_sa_papira, client_id'),
    admin.from('terms').select('date, slot_index, predavanja(client_id)').gte('date', od).lte('date', doDatuma).range(0, 9999),
    admin
      .from('zahtevi_za_cas')
      .select('client_id, requested_date, requested_slot_index')
      .eq('status', 'pending')
      .gte('requested_date', od)
      .lte('requested_date', doDatuma)
      .range(0, 9999),
  ]);

  const brojac = new Map<string, Map<string, number>>();
  const dodaj = (clientId: string, datum: string, slot: number) => {
    const k = kljucDanVreme(String(datum).slice(0, 10), slot);
    const m = brojac.get(clientId) ?? new Map<string, number>();
    m.set(k, (m.get(k) ?? 0) + 1);
    brojac.set(clientId, m);
  };
  for (const t of (terminiRes.data ?? []) as { date: string; slot_index: number; predavanja: { client_id: string }[] | null }[]) {
    for (const p of t.predavanja ?? []) dodaj(p.client_id, t.date, t.slot_index);
  }
  for (const z of (zahteviRes.data ?? []) as { client_id: string; requested_date: string; requested_slot_index: number }[]) {
    dodaj(z.client_id, z.requested_date, z.requested_slot_index);
  }
  const obicno: Record<string, string[]> = {};
  for (const [clientId, m] of brojac) {
    obicno[clientId] = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }

  const zapamceno: Record<string, string> = {};
  for (const r of (imenaRes.data ?? []) as { ime_sa_papira: string; client_id: string }[]) zapamceno[r.ime_sa_papira] = r.client_id;

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-800">Uvoz rasporeda</h1>
        <p className="text-stone-500 text-sm mt-0.5 max-w-3xl">
          Nalepite spisak termina (npr. prepisan sa papira), za svako ime izaberite tačno dete, proverite pregled i uvezite. Ništa se ne
          upisuje dok ne kliknete „Uvezi“. Termin koji dete već ima se preskače, pa isti spisak može da se uveze i dvaput.
        </p>
      </div>
      <UvozRasporeda
        danas={danas}
        klijenti={(klijentiRes.data ?? []) as KlijentZaUvoz[]}
        vrste={(vrsteRes.data ?? []) as { id: string; naziv: string; trajanje_minuta: number | null }[]}
        instruktori={((instruktoriRes.data ?? []) as { id: string; ime: string; prezime: string; aktivan?: boolean | null }[]).filter(
          (i) => i.aktivan !== false
        )}
        ucionice={(ucioniceRes.data ?? []) as { id: string; naziv: string }[]}
        zapamceno={zapamceno}
        obicno={obicno}
      />
    </div>
  );
}
