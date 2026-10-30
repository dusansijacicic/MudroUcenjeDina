import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDashboardInstructor } from '@/lib/dashboard';
import { Koraci, Lista, Napomena, Sekcija, Ui } from '@/components/Uputstvo';
import { M, SemaKadaNeRadi } from '@/app/admin/uputstvo/sheme';

/**
 * Uputstvo za predavača – klik po klik za svaku njegovu stranicu. Dugme „Uputstvo“ u meniju otvara
 * samo deo za stranicu na kojoj se predavač nalazi (?deo=…, mapa u DashboardNav.tsx).
 */

const SADRZAJ: { id: string; naslov: string }[] = [
  { id: 'kalendar', naslov: 'Kalendar' },
  { id: 'termin', naslov: 'Termin i radionica' },
  { id: 'zahtevi', naslov: 'Zahtevi' },
  { id: 'klijenti', naslov: 'Klijenti' },
  { id: 'uplate', naslov: 'Uplate' },
  { id: 'kada-ne-radim', naslov: 'Kada ne radim' },
  { id: 'podesavanja', naslov: 'Podešavanja (dostupnost za učenike)' },
];

export default async function PredavacUputstvoPage({ searchParams }: { searchParams: Promise<{ deo?: string }> }) {
  const { instructor } = await getDashboardInstructor();
  if (!instructor) redirect('/login?reason=no_instructor');

  const { deo } = await searchParams;
  const izabrano = SADRZAJ.find((s) => s.id === deo);
  const prikazi = izabrano ? new Set([izabrano.id]) : null;
  const sadrzaj = izabrano ? [izabrano] : SADRZAJ;

  return (
    <div className="max-w-5xl pb-16 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8">
      <aside className="mb-6 lg:mb-0">
        <nav aria-label="Sadržaj uputstva" className="lg:sticky lg:top-20 rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Sadržaj</p>
          <ul className="space-y-1">
            {sadrzaj.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-stone-700 hover:bg-amber-50 hover:text-amber-800">
                  {s.naslov}
                </a>
              </li>
            ))}
          </ul>
          {prikazi && (
            <Link href="/dashboard/uputstvo" className="mt-3 block border-t border-stone-100 pt-2 text-xs font-medium text-amber-700 hover:underline">
              Prikaži celo uputstvo →
            </Link>
          )}
        </nav>
      </aside>

      <div className="min-w-0 max-w-3xl space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-stone-800 mb-2">{izabrano ? `Uputstvo – ${izabrano.naslov}` : 'Uputstvo za predavače'}</h1>
          <p className="text-sm leading-relaxed text-stone-600">
            Klik po klik, za stranice koje vi kao predavač vidite. Dugme <Ui>❓ Uputstvo</Ui> u meniju uvek otvara deo za stranicu na kojoj
            ste.
          </p>
        </header>

        <Sekcija prikazi={prikazi} id="kalendar" naslov="Kalendar">
          <Koraci>
            <li>Na kalendaru su samo VAŠI termini, za izabranu nedelju. Strelicama menjate nedelju.</li>
            <li>Polje <Ui>Klijent:</Ui> gore – izaberite dete da vidite samo njegove časove (<Ui>Svi</Ui> = sva deca).</li>
            <li><Ui>+</Ui> u praznoj ćeliji = novi termin za taj dan i vreme.</li>
            <li>Klik na termin otvara ga – deca u terminu, održano, plaćeno, komentar.</li>
            <li>Premeštanje: uhvatite termin mišem, prevucite u drugu ćeliju i potvrdite.</li>
          </Koraci>
          <Lista>
            <li>„⛔ Blokirano“ = to vreme je zatvoreno za sve (npr. praznik).</li>
            <li>„⛔ Vi ne radite“ = vaša blokada iz <a href="#kada-ne-radim" className="text-amber-700 underline">Kada ne radim</a> – tu vam niko ne može zakazati čas.</li>
            <li>Kalendar se sam osvežava kad neko nešto promeni – ne treba F5.</li>
          </Lista>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="termin" naslov="Termin i radionica">
          <Koraci>
            <li>Kliknite termin na kalendaru.</li>
            <li><Ui>+ Dodaj radionicu</Ui> = još jedno dete u ovom terminu (pretraga po imenu, bilo koje dete iz baze).</li>
            <li>
              Kliknite dete → izmena radionice: vrsta časa, <Ui>Održano</Ui>, <Ui>Plaćeno</Ui>, <Ui>Komentar (šta je rađeno)</Ui> → sačuvajte.
            </li>
            <li>Kategorija i napomena termina menjaju se na vrhu stranice termina.</li>
            <li>Otkazivanje termina: ostaje sivi zapis u istoriji deteta.</li>
          </Koraci>
          <Napomena>Termini čije je vreme prošlo automatski se računaju kao održani.</Napomena>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="zahtevi" naslov="Zahtevi">
          <Koraci>
            <li>Meni → <Ui>Zahtevi</Ui>: časovi koji čekaju predavača – zakazani bez instruktora ili zahtevi učenika.</li>
            <li><Ui>Preuzmi</Ui> – čas bez instruktora postaje vaš termin.</li>
            <li><Ui>Potvrdi</Ui> – prihvatate zahtev učenika u traženo vreme.</li>
            <li>
              <Ui>Promeni termin</Ui> → izaberite <Ui>Datum</Ui> i <Ui>Vreme</Ui>, po želji napomena (npr. „pozvao sam, dogovoreno“) →{' '}
              <Ui>Sačuvaj novi termin</Ui>.
            </li>
            <li><Ui>Odbij</Ui> – zahtev se zatvara. Dole su <Ui>Rešeni zahtevi</Ui> (istorija).</li>
          </Koraci>
          <Napomena>Ne možete preuzeti čas u vreme kada ste blokirani (Kada ne radim) – aplikacija javi poruku.</Napomena>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="klijenti" naslov="Klijenti">
          <Koraci>
            <li>Lista sve dece (ne samo vaše) sa stanjem po vrsti časa: plaćeno / održano / preostalo.</li>
            <li>Klik na dete → statistika časova, pregled po vrstama, istorija časova kod vas, izmena podataka.</li>
            <li>Novo dete: <Ui>Novi klijent</Ui> → popunite podatke (kontakt telefon je obavezan) → sačuvajte.</li>
          </Koraci>
          <Napomena>Popust (%) menja samo admin.</Napomena>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="uplate" naslov="Uplate">
          <Koraci>
            <li>Meni → <Ui>Uplate</Ui>: uplate koje ste VI primili.</li>
            <li><Ui>Unesi uplatu</Ui> → <Ui>Datum uplate</Ui> (danas po difoltu, može i raniji dan).</li>
            <li>Kucajte ime deteta i kliknite ga.</li>
            <li>Vrsta časa i broj časova – iznos se sam izračuna (cena − popust deteta); po potrebi ga ispravite.</li>
            <li>Kliknite <Ui>Unesi uplatu</Ui>. Izmenu ili brisanje uplate radi admin.</li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="kada-ne-radim" naslov="Kada ne radim">
          <SemaKadaNeRadi />
          <Koraci>
            <li>
              <Ui>Svake nedelje (stalno)</Ui>: kliknite polja (dan × vreme) kada NE radite – postanu tamna sa ✕. Važi svake nedelje dok ne
              promenite.
            </li>
            <li>Klik na naziv dana (npr. <Ui>Sub</Ui>) označi ili skine ceo dan.</li>
            <li>Po želji razlog, pa <Ui>Sačuvaj nedeljni raspored</Ui>.</li>
            <li>
              <Ui>Pojedinačni dani</Ui> (odmor, lekar…): datum → vremena (ili <Ui>Ceo dan</Ui>) → razlog → <Ui>Blokiraj (N)</Ui>.
            </li>
            <li>Spisak predstojećih blokada je ispod; <Ui>✕</Ui> na vremenu je uklanja.</li>
          </Koraci>
          <Napomena>
            U tim vremenima vam niko ne može zakazati čas – ni admin, ni vi, ni učenik. Ostali predavači u to vreme rade normalno.
          </Napomena>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="podesavanja" naslov="Podešavanja (dostupnost za učenike)">
          <Koraci>
            <li>
              <Ui>Dostupnost (nedeljni raspored)</Ui>: vremena koja učenik vidi kao slobodna kada klikne „Zatraži termin“ kod vas.
            </li>
            <li>Označite dane i vremena, pa <Ui>Sačuvaj</Ui>.</li>
          </Koraci>
          <Napomena>
            Razlika: <strong>Podešavanja</strong> kažu učenicima kada MOGU da traže čas. <strong>Kada ne radim</strong> potpuno zabranjuje
            zakazivanje vama u tim vremenima – za sve (admina, vas i učenike).
          </Napomena>
        </Sekcija>

        <p className="flex items-center gap-2 text-sm">
          <M n="?" />
          <span className="text-stone-600">
            Nešto nije jasno ili ne radi? Javite adminu – u Dnevniku aktivnosti se vidi šta je urađeno i kada.
          </span>
        </p>
      </div>
    </div>
  );
}
