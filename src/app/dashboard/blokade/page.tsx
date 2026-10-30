import { redirect } from 'next/navigation';
import { getDashboardInstructor } from '@/lib/dashboard';
import { danasBeograd } from '@/lib/datum';
import { ucitajBlokadeInstruktora } from '@/lib/blokade';
import BlokadeInstruktora from '@/components/BlokadeInstruktora';

/** Predavač: kada NE radi – stalni nedeljni raspored i pojedinačni dani (samo za sebe). */
export default async function MojeBlokadePage() {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const blok = await ucitajBlokadeInstruktora(instructor.id, danasBeograd());

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-800">Kada ne radim</h1>
        <p className="mt-1 text-sm text-stone-600">
          Označite vremena kada ne radite. U njima vam niko ne može zakazati čas (ni admin, ni učenik). Ostali predavači u to vreme rade
          normalno.
        </p>
      </div>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <BlokadeInstruktora
          mode="instruktor"
          instructorId={instructor.id}
          ime={`${instructor.ime ?? ''} ${instructor.prezime ?? ''}`.trim()}
          nedeljne={blok.nedeljne}
          blokade={blok.blokade}
          migracijaPokrenuta={blok.migracijaPokrenuta}
        />
      </section>
    </div>
  );
}
