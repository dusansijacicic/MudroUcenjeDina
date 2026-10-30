import Link from 'next/link';
import { Crveno, Koraci, Lista, Napomena, Podnaslov, Sekcija, Ui, Upozorenje } from '@/components/Uputstvo';
import {
  M,
  SemaBlokiranje,
  SemaBlokirani,
  SemaDnevnik,
  SemaFilter,
  SemaInstruktori,
  SemaKadaNeRadi,
  SemaKalendar,
  SemaKartica,
  SemaKlijenti,
  SemaMeni,
  SemaModovi,
  SemaPodesavanja,
  SemaProfil,
  SemaSifarnici,
  SemaTermin,
  SemaTestiranja,
  SemaUplataForma,
  SemaUplateLista,
  SemaZakazivanje,
} from './sheme';

/**
 * Uputstvo klik po klik za svaku admin stranicu, sa šemama ekrana (./sheme.tsx) čiji numerisani
 * markeri odgovaraju koracima. Vidljivo samo adminima – provera je u src/app/admin/layout.tsx.
 * Dugme „Uputstvo“ u meniju vodi direktno na sekciju za trenutnu stranicu (id-jevi sekcija ispod
 * moraju da odgovaraju mapi UPUTSTVO_ZA_STRANICU u AdminNav.tsx).
 */

const SADRZAJ: { id: string; naslov: string }[] = [
  { id: 'pocetak', naslov: 'Tipičan dan – brzi početak' },
  { id: 'kalendar', naslov: 'Kalendar' },
  { id: 'kalendar-citanje', naslov: 'Kalendar – kako čitati termin' },
  { id: 'kalendar-filter', naslov: 'Kalendar – filter po detetu' },
  { id: 'kalendar-modovi', naslov: 'Kalendar – Swap, Copy, Delete, Označi plaćeno…' },
  { id: 'kalendar-blokiranje', naslov: 'Kalendar – blokiranje' },
  { id: 'zakazivanje-termina', naslov: 'Zakaži termin' },
  { id: 'termin', naslov: 'Stranica termina' },
  { id: 'klijenti', naslov: 'Klijenti (lista)' },
  { id: 'profil-klijenta', naslov: 'Profil deteta' },
  { id: 'uplate', naslov: 'Uplate' },
  { id: 'blokirani', naslov: 'Blokirani termini' },
  { id: 'testiranja', naslov: 'Testiranja' },
  { id: 'instruktori', naslov: 'Instruktori' },
  { id: 'kada-ne-radi', naslov: 'Instruktor – kada ne radi' },
  { id: 'sifarnici', naslov: 'Vrste časova, kategorije, programi, učionice' },
  { id: 'dnevnik', naslov: 'Dnevnik aktivnosti' },
  { id: 'podesavanja', naslov: 'Podešavanja i bekap' },
  { id: 'uloge', naslov: 'Ko šta sme (uloge)' },
];

/** Koje sekcije pripadaju kojoj stranici (?deo=… iz dugmeta „Uputstvo“ u meniju). */
const DELOVI: Record<string, { naslov: string; sekcije: string[] }> = {
  kalendar: { naslov: 'Kalendar', sekcije: ['kalendar', 'kalendar-citanje', 'kalendar-filter', 'kalendar-modovi', 'kalendar-blokiranje'] },
  'zakazivanje-termina': { naslov: 'Zakaži termin', sekcije: ['zakazivanje-termina'] },
  termin: { naslov: 'Stranica termina', sekcije: ['termin'] },
  klijenti: { naslov: 'Klijenti', sekcije: ['klijenti'] },
  'profil-klijenta': { naslov: 'Profil deteta', sekcije: ['profil-klijenta'] },
  uplate: { naslov: 'Uplate', sekcije: ['uplate'] },
  blokirani: { naslov: 'Blokirani termini', sekcije: ['blokirani', 'kalendar-blokiranje'] },
  testiranja: { naslov: 'Testiranja', sekcije: ['testiranja'] },
  instruktori: { naslov: 'Instruktori', sekcije: ['instruktori', 'kada-ne-radi'] },
  sifarnici: { naslov: 'Vrste časova, kategorije, programi, učionice', sekcije: ['sifarnici'] },
  dnevnik: { naslov: 'Dnevnik aktivnosti', sekcije: ['dnevnik'] },
  podesavanja: { naslov: 'Podešavanja', sekcije: ['podesavanja'] },
};

export default async function AdminUputstvoPage({ searchParams }: { searchParams: Promise<{ deo?: string }> }) {
  const { deo } = await searchParams;
  const izabrano = deo ? DELOVI[deo] : undefined;
  // Samo deo za jednu stranicu (iz menija) ili celo uputstvo.
  const prikazi = izabrano ? new Set(izabrano.sekcije) : null;
  const sadrzaj = prikazi ? SADRZAJ.filter((s) => prikazi.has(s.id)) : SADRZAJ;
  return (
    <div className="max-w-6xl pb-16 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10">
      <aside className="mb-8 lg:mb-0">
        <nav aria-label="Sadržaj uputstva" className="lg:sticky lg:top-4 rounded-xl border border-stone-200 bg-white p-4 text-sm">
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
            <Link href="/admin/uputstvo" className="mt-3 block border-t border-stone-100 pt-2 text-xs font-medium text-amber-700 hover:underline">
              Prikaži celo uputstvo →
            </Link>
          )}
        </nav>
      </aside>

      <div className="min-w-0 max-w-3xl space-y-10">
        <header>
          <h1 className="text-2xl font-semibold text-stone-800 mb-2">{izabrano ? `Uputstvo – ${izabrano.naslov}` : 'Uputstvo'}</h1>
          <p className="text-stone-600 text-sm leading-relaxed">
            Kako se radi na svakoj stranici, klik po klik. Uz svaku stranicu je šema ekrana: brojevi u narandžastim kružićima{' '}
            <M n={1} /> <M n={2} /> odgovaraju koracima ispod slike. Dugme <Ui>❓ Uputstvo</Ui> u gornjem meniju uvek otvara deo
            uputstva za stranicu na kojoj se trenutno nalazite.
          </p>
        </header>

        <Sekcija prikazi={prikazi} id="pocetak" naslov="Tipičan dan – brzi početak">
          <SemaMeni />
          <Koraci>
            <li><Ui>Kalendar</Ui> – pregled ove i sledeće nedelje za sve instruktore. Ovde provodite najviše vremena.</li>
            <li>Novo dete ili novi čas: <Ui>+ Zakaži termin</Ui> (ili <Ui>+</Ui> u praznoj ćeliji kalendara – datum i vreme se sami popune).</li>
            <li>
              Roditelj je platio: na kalendaru <Ui>Označi plaćeno</Ui> → kliknite dete u terminu od kog je plaćeno → <Ui>✓ Potvrdi plaćeno</Ui>.
              Taj čas i sledećih 5 časova te vrste su plaćeni. Novac se po želji upisuje u <Ui>+ Unesi uplatu</Ui> (samo evidencija).
            </li>
            <li>
              Ko nije platio: posle potrošenih 6 časova kalendar pokazuje crveno <Crveno>! nije plaćeno</Crveno>; na stranici{' '}
              <Ui>Klijenti</Ui> crveno „nije plaćeno N“.
            </li>
            <li>Kraj dana: <Ui>Podešavanja</Ui> → <Ui>⬇ Preuzmi bekap baze (JSON)</Ui>.</li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="kalendar" naslov="Kalendar">
          <SemaKalendar />
          <Koraci>
            <li>
              Izaberite prikaz: <Ui>Dan</Ui> (jedan dan), <Ui>Nedelja</Ui> (ova + sledeća nedelja, 14 dana) ili <Ui>Mesec</Ui> (ceo mesec,
              po danu do 4 termina i „+N još“ – klik na broj dana otvara taj dan).
            </li>
            <li>
              <Ui>← Prethodna</Ui> / <Ui>Sledeća →</Ui> pomera period. Ova traka ostaje zalepljena na vrhu dok skrolujete, zajedno sa
              dugmićima Swap, Copy…
            </li>
            <li>Pređite mišem preko bilo koje ćelije – ljubičasto se oboje taj dan (kolona) i to vreme (red), da se lako prati.</li>
          </Koraci>
          <Podnaslov>Brze radnje na samom kalendaru</Podnaslov>
          <Lista>
            <li>Klik na termin otvara <a href="#termin" className="text-amber-700 underline">stranicu termina</a>.</li>
            <li>Premeštanje: uhvatite termin mišem, prevucite ga u drugu ćeliju, pustite i potvrdite.</li>
            <li><Ui>+</Ui> u praznoj ćeliji = novi termin za taj dan i vreme; <Ui>+ Testiranje</Ui> = termin testiranja.</li>
            <li><Ui>+ Dodaj još termin u ovom slotu</Ui> ispod postojećih = još jedan paralelan termin u istom vremenu (drugi instruktor/učionica).</li>
            <li>Žuta traka na vrhu „termini bez instruktora/učionice“: klik na datum vodi pravo do tog časa.</li>
            <li><Ui>🖨 Print / PDF</Ui> = raspored spreman za štampu ili čuvanje kao PDF.</li>
            <li>Kalendar se sam osvežava kad bilo ko nešto promeni (drugi admin, predavač, nova uplata) – ne treba F5.</li>
          </Lista>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="kalendar-citanje" naslov="Kalendar – kako čitati termin">
          <SemaKartica />
          <Lista>
            <li><M n="A" /> Gore levo: instruktor. Boja slova je boja instruktora iz legende iznad kalendara.</li>
            <li><M n="B" /> <M n="C" /> Gore desno: vrsta časa i učionica (siva oznaka).</li>
            <li>
              <M n="D" /> Svako dete je u svom redu. Boje redova (žuta, plava, zelena…) idu redom u istom vremenu – da se na prvi pogled vidi
              koliko je dece u isto vreme.
            </li>
            <li>
              <M n="E" /> Desno od imena <strong>x/6 · još N</strong> (samo ako je za dete označeno plaćanje): ovo je x-ti od 6 plaćenih
              časova te vrste; posle njega ostaje još N. <span className="font-bold text-amber-700">6/6 · poslednji</span> = poslednji plaćeni
              čas – vreme za naplatu. Dete bez oznake nema natpis.
            </li>
            <li><M n="F" /> Crveni red sa <Crveno>! nije plaćeno</Crveno> i crveni okvir termina = paket je potrošen, a ovaj čas nije plaćen.</li>
            <li><M n="G" /> Narandžasta kartica sa isprekidanim okvirom = čas zakazan bez instruktora; čeka da ga neki predavač preuzme.</li>
            <li><M n="H" /> Siva = otkazan čas (istorija). Prugasto „⛔ Blokirano“ = u tom vremenu niko ne može da zakaže.</li>
            <li>
              U jednom vremenu (npr. 9:00) može biti više paralelnih termina – svaki ima svog instruktora i svoju učionicu. Koliko najviše,
              podešava se u <Ui>Podešavanja</Ui>.
            </li>
          </Lista>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="kalendar-filter" naslov="Kalendar – filter po detetu">
          <SemaFilter />
          <Koraci>
            <li>U polje <Ui>Dete:</Ui> počnite da kucate ime ili prezime. Kvačice nisu bitne: „djordje“ i „dorde“ nalaze „Đorđe“.</li>
            <li>Kliknite dete u listi (ili strelicama ↑↓ pa Enter). Kalendar sada pokazuje samo termine tog deteta.</li>
            <li>Ljubičasta traka pokazuje koliko časova ima u prikazanom periodu; <Ui>Ceo mesec za ovo dete →</Ui> otvara mesečni pregled.</li>
            <li>Filter ostaje i kad idete na sledeću/prethodnu nedelju ili menjate Dan/Nedelja/Mesec. Uklanja se klikom na <Ui>✕</Ui>.</li>
            <li>Isto rade i <Ui>Instruktor:</Ui> i <Ui>Učionica:</Ui> – mogu se kombinovati sa detetom.</li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="kalendar-modovi" naslov="Kalendar – Swap, Copy, Delete, Zakaži više časova, Dodeli, Označi plaćeno">
          <SemaModovi />
          <Napomena>
            Svi modovi rade isto: <strong>uključite dugme</strong> (postane obojeno) → <strong>kliknite termine</strong> na kalendaru →{' '}
            <strong>potvrdite</strong> zelenim dugmetom gore desno, pored <Ui>Print / PDF</Ui>. Ponovni klik na dugme moda ga isključuje.
            Dok je mod uključen, kalendar se ne osvežava sam (da se ništa ne pomeri dok birate).
          </Napomena>

          <Podnaslov>Swap – zamena dva termina (slika iznad)</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Swap</Ui>.</li>
            <li>Čekirajte šta se menja: <Ui>Termin</Ui> (vreme), <Ui>Instruktor</Ui>, <Ui>Učionica</Ui> i/ili <Ui>Klijent</Ui>.</li>
            <li>Kliknite prvi, pa drugi termin.</li>
            <li>Kliknite <Ui>✓ Potvrdi zamenu</Ui>.</li>
          </Koraci>

          <Podnaslov>Copy – kopiranje termina</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Copy</Ui>, pa termin koji kopirate („Kopiraj iz:“ pokazuje koji je izabran).</li>
            <li>Čekirajte šta se kopira (instruktor, učionica, dete); po želji izaberite drugu vrstu časa.</li>
            <li>Kliknite jednu ili više praznih ćelija gde ide kopija.</li>
            <li>Kliknite <Ui>✓ Potvrdi kopiranje (N)</Ui>. Održano i plaćeno se ne prenose.</li>
          </Koraci>

          <Podnaslov>Delete – trajno brisanje</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Delete</Ui>.</li>
            <li>Kliknite termine koje brišete (mogu i sivi otkazani i narandžasti zahtevi) – postanu crveno obeleženi.</li>
            <li>Kliknite <Ui>✓ Potvrdi brisanje (N)</Ui>.</li>
          </Koraci>
          <Upozorenje>
            Delete briše BEZ TRAGA. Ako dete samo ne dolazi, koristite <Ui>Otkaži termin</Ui> na stranici termina – tada ostaje sivi zapis u
            istoriji.
          </Upozorenje>

          <Podnaslov>Zakaži više časova – jedno dete (ili grupa) u više termina odjednom</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Zakaži više časova</Ui>.</li>
            <li>
              Izaberite dete. Za grupu čekirajte <Ui>Grupa (više dece odjednom u istim terminima)</Ui>, označite decu i izaberite grupnu
              kategoriju.
            </li>
            <li>
              Po želji: instruktor, učionica, vrsta časa. Bez instruktora („bez instruktora (zahtev)“) časovi čekaju da ih predavač preuzme;
              grupa mora imati instruktora.
            </li>
            <li>
              Kliknite sve ćelije (dan + vreme) kada dete dolazi. Ispod postojećih časova uvek je prazan deo „+ još jedno dete u ovo vreme“.
              Ako je izabran instruktor, vremena kada on ne radi su crvena („⛔ izabrani instruktor ne radi“) i ne mogu se izabrati.
            </li>
            <li>Kliknite <Ui>✓ Potvrdi zakazivanje (N)</Ui>.</li>
          </Koraci>

          <Podnaslov>Dodeli instruktora/učionicu/vrstu</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Dodeli instruktora/učionicu/vrstu</Ui>.</li>
            <li>Izaberite instruktora i/ili učionicu i/ili vrstu časa (bilo koja kombinacija; prazno = ne menja se).</li>
            <li>Kliknite termine i narandžaste časove bez instruktora kojima to dodeljujete.</li>
            <li>Kliknite <Ui>✓ Potvrdi dodelu (N)</Ui>.</li>
          </Koraci>

          <Podnaslov>Označi plaćeno – od kog časa je plaćeno</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Označi plaćeno</Ui> (nedeljni ili dnevni prikaz).</li>
            <li>
              Kliknite <strong>dete</strong> u terminu od kog je plaćeno (može i narandžasti čas bez instruktora) – red dobije zeleni okvir i
              „✓ plaćeno od ovde (6 časova)“. Može više dece odjednom.
            </li>
            <li>Kliknite <Ui>✓ Potvrdi plaćeno (N)</Ui>.</li>
            <li>
              Od tog časa, taj i sledećih 5 časova tog deteta <strong>iste vrste</strong> su plaćeni: na kalendaru piše „1/6 · još 5“,
              „2/6 · još 4“ … „6/6 · poslednji“. Sledeći časovi su crveni <Crveno>! nije plaćeno</Crveno> dok se opet ne označi.
            </li>
            <li>
              Uklanjanje: u istom modu dete sa „💰 od ovde“ → klik (crveni okvir) → <Ui>✓ Potvrdi plaćeno</Ui>. Ili na profilu deteta →
              <Ui>Plaćeno od (oznake)</Ui> → <Ui>Ukloni</Ui>.
            </li>
          </Koraci>
          <Napomena>
            Ovo je jedini pokazatelj da je plaćeno – uplate ne utiču. Časovi pre prve oznake se ne računaju. Ako se označi novi paket dok
            stari još traje, 6 časova se dodaje na kraj (ništa se ne gubi). Brisanje ili otkazivanje časa pomera brojanje, jer se broje
            samo časovi koji postoje.
          </Napomena>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="kalendar-blokiranje" naslov="Kalendar – blokiranje vremena">
          <SemaBlokiranje />
          <Koraci>
            <li>Kliknite <Ui>Blokiraj termin(e)</Ui>. U ovom modu vide se svi časovi, i oni bez instruktora i učionice.</li>
            <li>
              <Ui>Za koga</Ui>: <Ui>Svi instruktori (ceo termin)</Ui> – niko ne može da zakaže; ili <Ui>Samo [instruktor]</Ui> – samo on ne
              može dobiti čas, ostali rade normalno. Upišite razlog u <Ui>Napomena – zašto se blokira</Ui> (npr. praznik, sastanak).
            </li>
            <li>Kliknite ćelije (dan + vreme) koje zatvarate. Postojeći časovi u njima i dalje se mogu otvoriti ili prevući na drugo vreme.</li>
            <li>
              Kliknite <Ui>✓ Blokiraj (N)</Ui>. Ako u izabranom vremenu već ima časova, pojaviće se upozorenje; ti časovi ostaju i vide se na
              stranici <Ui>Blokirani termini</Ui> kao „Treba premestiti“.
            </li>
            <li>Odblokiranje: <Ui>Odblokiraj</Ui> na samoj ćeliji ili na stranici Blokirani termini.</li>
          </Koraci>
          <Napomena>
            Blokada „za sve“ zatvara ceo to vreme tog dana: sve učionice, sve instruktore, i za admina, predavače i učenike (prugasto
            „⛔ Blokirano“). Blokada jednog instruktora se na kalendaru vidi kao mala siva oznaka „⛔ Ime – razlog“ (sa ↻ ako je stalna
            nedeljna) – taj instruktor se u to vreme ne može izabrati, ostali mogu.
          </Napomena>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="zakazivanje-termina" naslov="Zakaži termin">
          <SemaZakazivanje />
          <Koraci>
            <li>Kliknite <Ui>+ Zakaži termin</Ui> u meniju, ili <Ui>+</Ui> u ćeliji kalendara (datum i vreme se sami popune).</li>
            <li>Desno, u <Ui>Pretraga klijenata</Ui>, kucajte ime i kliknite dete. Za grupnu kategoriju čekirajte više dece.</li>
            <li>Levo: proverite <Ui>Datum</Ui> i <Ui>Vreme (slot)</Ui>, izaberite <Ui>Kategorija termina</Ui> i vrstu časa.</li>
            <li>
              Instruktor i učionica su po difoltu <Ui>Bez instruktora</Ui> / <Ui>Bez učionice</Ui> – tada čas čeka da ga neki predavač
              preuzme. Za grupu i testiranje instruktor je obavezan. „(zauzeto)“ = taj instruktor/učionica već ima čas u tom vremenu;
              „(blokiran – ne radi tada)“ = instruktor je za to vreme blokiran (ne može se izabrati).
            </li>
            <li>Po želji: napomena i „i narednih N dana“ (isti čas i narednih N uzastopnih dana; 0 = samo taj dan).</li>
            <li>Kliknite <Ui>Zakaži termin</Ui>. Vraćate se na kalendar, koji se sam pomeri do novog termina i kratko ga zasvetli ljubičasto.</li>
          </Koraci>
          <Lista>
            <li>Kategorija „Testiranje“: deca se upisuju odmah (ime obavezno) ili kasnije na stranici termina.</li>
            <li>Kategorija „Nastavak“: za duži čas koji se nastavlja na prethodni – bira se roditeljski termin; ne računa se u plaćene časove.</li>
            <li>U blokiranom vremenu zakazivanje nije moguće – pojavi se crvena poruka „Termin je blokiran“.</li>
            <li>Detaljniji link „Uputstvo za zakazivanje →“ na samoj stranici vodi ovde.</li>
          </Lista>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="termin" naslov="Stranica termina">
          <SemaTermin />
          <Koraci>
            <li><Ui>Kategorija i napomena termina</Ui>: promenite kategoriju ili napomenu i sačuvajte.</li>
            <li>
              Kod svakog deteta: ime je link na profil, plus <Ui>Profil, uplate i održani časovi →</Ui>. Ako je označeno plaćanje, ispod
              piše koji je to čas od plaćenih („3. čas od 6 plaćenih · preostalo još 3“, narandžasto „poslednji plaćeni“ ili crveno „Nije
              plaćeno“).
            </li>
            <li><Ui>+ Dodaj radionicu</Ui> = još jedno dete u ovom terminu (do limita iz Podešavanja).</li>
            <li><Ui>Izmeni</Ui> kod deteta = održano, plaćeno, vrsta časa, komentar; tamo je i <Ui>Obriši</Ui> (dete izlazi iz termina).</li>
            <li><Ui>Otkaži termin</Ui> = termin nestaje sa kalendara, a ostaje sivi zapis u istoriji deteta.</li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="klijenti" naslov="Klijenti (lista)">
          <SemaKlijenti />
          <Koraci>
            <li>Pretraga: kucajte ime, prezime, školu ili telefon – lista se filtrira odmah, bez čekanja.</li>
            <li>
              Kolona „Održano do danas, po vrsti časa“: „održano“ broji sve časove čije je vreme prošlo. Kad je na kalendaru označeno
              plaćanje, pored piše i „plaćeno / preostalo“, a crveno „nije plaćeno N“ = održani časovi posle potrošenog paketa.
            </li>
            <li>Klik na ime ili <Ui>Profil, uplate i održani časovi →</Ui> otvara profil deteta.</li>
            <li><Ui>+ Novi klijent</Ui> → popunite podatke (kontakt telefon je obavezan) → <Ui>Dodaj klijenta</Ui>.</li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="profil-klijenta" naslov="Profil deteta">
          <SemaProfil />
          <Koraci>
            <li><Ui>Pregled po vrstama časova</Ui>: održano / plaćeno / preostalo / nije plaćeno za svaku vrstu časa.</li>
            <li>
              <Ui>Plaćeno od (oznake)</Ui>: od kog časa je označeno plaćeno (po 6 časova). Klik na datum otvara kalendar na tom času;{' '}
              <Ui>Ukloni</Ui> briše oznaku.
            </li>
            <li>
              <Ui>Uplate</Ui> (samo evidencija novca): sve uplate deteta, najnovije prve, sa zbirom. <Ui>+ Dodaj uplatu</Ui> otvara formu odmah tu (dete je već
              izabrano) → popunite → <Ui>Unesi uplatu</Ui>. Kod svake uplate su <Ui>Izmeni</Ui> i <Ui>Obriši</Ui>.
            </li>
            <li>
              <Ui>Pregled termina</Ui>: levo zakazani (isprekidano = još bez instruktora), desno održani – sa vrstom časa, instruktorom i
              cenom časa, i (ako je označeno plaćanje) koji je to čas od plaćenih. Klik na termin ga otvara.
            </li>
            <li><Ui>Otkazani termini</Ui>: istorija otkazanih časova; može se označiti naplaćeno ili obrisati iz istorije.</li>
            <li><Ui>Izmena podataka klijenta</Ui>: ime, kontakt, škola, popust %, programi… → sačuvajte dugmetom na dnu forme.</li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="uplate" naslov="Uplate">
          <Podnaslov>Unos nove uplate</Podnaslov>
          <SemaUplataForma />
          <Koraci>
            <li>Kliknite <Ui>+ Unesi uplatu</Ui> u meniju (ili na stranici Evidencija uplata).</li>
            <li><Ui>Ko je primio (instruktor)</Ui> – obavezno izaberite ko je primio novac.</li>
            <li><Ui>Datum uplate</Ui> – danas po difoltu; ako je novac primljen ranije, izaberite taj dan (budući dan nije moguć).</li>
            <li><Ui>Klijent</Ui> – kucajte ime i kliknite dete.</li>
            <li><Ui>Vrsta časa</Ui> i <Ui>Broj časova</Ui> – iznos se sam izračuna: cena po času × broj časova − popust deteta.</li>
            <li>Po potrebi: drugi popust za ovu uplatu, ručno ispravljen iznos, napomena.</li>
            <li>
              Kliknite <Ui>Unesi uplatu</Ui>. Ovo je evidencija novca – da li je čas plaćen označava se na kalendaru (<Ui>Označi plaćeno</Ui>).
            </li>
          </Koraci>
          <Podnaslov>Izmena i brisanje</Podnaslov>
          <SemaUplateLista />
          <Koraci>
            <li><Ui>Izmeni</Ui> → promenite šta treba (i datum) → <Ui>Sačuvaj izmene</Ui>.</li>
            <li><Ui>Obriši</Ui> → potvrdite. Plaćeni časovi deteta se ne menjaju (oni su iz oznaka na kalendaru).</li>
          </Koraci>
          <Napomena>
            Svaka izmena i brisanje upisuje se u Dnevnik aktivnosti sa starim vrednostima – obrisana uplata može ručno da se vrati. Isto
            se može i sa profila deteta (sekcija Uplate).
          </Napomena>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="blokirani" naslov="Blokirani termini">
          <SemaBlokirani />
          <Koraci>
            <li>Lista svih blokada (najnovije prve): datum, vreme i razlog.</li>
            <li>„Treba premestiti“ = u tom vremenu je ostao zakazan čas – kliknite ga i premestite (ili ga prevucite na kalendaru).</li>
            <li><Ui>Odblokiraj</Ui> vraća to vreme u zakazivanje.</li>
          </Koraci>
          <Napomena>Nova blokada se pravi na kalendaru – vidi <a href="#kalendar-blokiranje" className="underline">Kalendar – blokiranje</a>.</Napomena>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="testiranja" naslov="Testiranja">
          <SemaTestiranja />
          <Koraci>
            <li>
              Napravite termin testiranja: na kalendaru <Ui>+ Testiranje</Ui> u ćeliji, ili <Ui>+ Zakaži termin</Ui> → kategorija
              Testiranje (sa instruktorom). Otvorite ga klikom.
            </li>
            <li><Ui>+ Dodaj</Ui> → upišite dete (ime obavezno; roditelj, telefon, razred opciono) → <Ui>Sačuvaj</Ui>.</li>
            <li>Posle testiranja promenite status: <Ui>Pojavio se</Ui> / <Ui>Nije se pojavio</Ui> i upišite komentar.</li>
            <li><Ui>Prebaci u klijenta</Ui> – od potencijalnog deteta pravi pravog klijenta.</li>
            <li>Stranica <Ui>Testiranja</Ui> u meniju: istorija svih testiranja, sa pretragom po detetu ili roditelju.</li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="instruktori" naslov="Instruktori">
          <SemaInstruktori />
          <Koraci>
            <li><Ui>+ Novi instruktor</Ui> → email i lozinka za prijavu, ime, prezime → <Ui>Kreiraj instruktora</Ui>.</li>
            <li><Ui>Uredi</Ui> → ime, telefon i boja u kalendaru → <Ui>Sačuvaj</Ui>.</li>
            <li>
              <Ui>Suspenduj</Ui>: instruktor se više ne nudi u listama za izbor, a već zakazani termini ostaju. <Ui>Aktiviraj</Ui> ga vraća.
            </li>
            <li>
              <Ui>Pregled →</Ui>: stranica instruktora – <Ui>Kalendar ovog instruktora</Ui>, <Ui>Uredi podatke</Ui>, <strong>Kada ne radi</strong>{' '}
              (vidi ispod), sledećih 7 dana i (sklopljen) spisak klijenata.
            </li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="kada-ne-radi" naslov="Instruktor – kada ne radi">
          <SemaKadaNeRadi />
          <Koraci>
            <li>
              <Ui>Svake nedelje (stalno)</Ui>: kliknite polja (dan × vreme) kada instruktor NE radi – postanu tamna sa ✕. Važi svake nedelje,
              sve dok se ne promeni.
            </li>
            <li>Klik na naziv dana (npr. <Ui>Sub</Ui>) označi ili skine ceo dan odjednom.</li>
            <li>Po želji razlog, pa <Ui>Sačuvaj nedeljni raspored</Ui>. <Ui>Poništi izmene</Ui> vraća poslednje sačuvano.</li>
            <li>
              <Ui>Pojedinačni dani</Ui> (odmor, lekar…): izaberite datum, kliknite vremena (ili <Ui>Ceo dan</Ui>), razlog →{' '}
              <Ui>Blokiraj (N)</Ui>.
            </li>
            <li>Ispod je spisak predstojećih blokada po danima; <Ui>✕</Ui> na vremenu je uklanja.</li>
          </Koraci>
          <Napomena>
            Isto ovo svaki predavač vidi kod sebe u meniju <Ui>Kada ne radim</Ui> i može da menja samo svoja vremena. U tim vremenima mu niko
            ne može zakazati čas: forma (piše „blokiran“), Zakaži više časova (crveno), Dodeli instruktora, Swap, prevlačenje i zahtev
            učenika – baza to odbije sa porukom.
          </Napomena>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="sifarnici" naslov="Vrste časova, kategorije, programi, učionice">
          <SemaSifarnici />
          <Lista>
            <li><M n="A" /> Gore popunite polja i kliknite <Ui>Dodaj</Ui> (za učionice <Ui>Dodaj učionicu</Ui>).</li>
            <li><M n="B" /> U listi: <Ui>Izmeni</Ui> (promena) ili brisanje.</li>
            <li>
              <Ui>Vrste časova</Ui>: naziv, program, cena po času (RSD) i trajanje u minutima. Preko 45 min čas zauzima i sledeći slot. Cena se
              koristi za automatski iznos uplate i za cenu časa u profilu deteta.
            </li>
            <li><Ui>Kategorije termina</Ui>: npr. individualni/grupni – čekirajte „Samo jedno dete u terminu“ za individualne.</li>
            <li><Ui>Programi</Ui>: grupe vrsta časova; „Redosled“ određuje mesto u listi (manji broj = ranije).</li>
            <li><Ui>Učionice</Ui>: naziv učionice; prikazuje se na terminu u kalendaru.</li>
          </Lista>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="dnevnik" naslov="Dnevnik aktivnosti">
          <SemaDnevnik />
          <Koraci>
            <li>Lista ko je šta uradio i kada: zakazivanje, otkazivanje, uplate, izmene uplata, blokade…</li>
            <li>Suženje: <Ui>Pretraga</Ui> (opis, ime, email), <Ui>Ko</Ui> (Admin / Predavač / Sistem), datumi Od–Do → <Ui>Filtriraj</Ui>.</li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="podesavanja" naslov="Podešavanja i bekap">
          <SemaPodesavanja />
          <Koraci>
            <li>
              Koliko dece najviše u jednom terminu, i koliko paralelnih termina najviše u istom vremenu (različiti instruktori u različitim
              učionicama).
            </li>
            <li>Kliknite <Ui>Sačuvaj podešavanja</Ui>.</li>
            <li>
              <Ui>⬇ Preuzmi bekap baze (JSON)</Ui> – preuzima kompletnu kopiju podataka. Preporuka: jednom dnevno; fajl čuvajte na sigurnom
              mestu jer sadrži lične podatke dece i roditelja.
            </li>
          </Koraci>
        </Sekcija>

        <Sekcija prikazi={prikazi} id="uloge" naslov="Ko šta sme (uloge)">
          <RoleBlock
            title="Admin"
            badgeClass="bg-amber-600 text-white"
            intro="Pun pristup – sve stranice iz ovog uputstva. Ulaz na /admin."
            items={[
              'Svi termini svih instruktora, svi modovi na kalendaru (Swap, Copy, Delete, Zakaži više časova, Dodeli, Blokiraj, Označi plaćeno).',
              'Plaćeno: samo admin označava na kalendaru (Označi plaćeno – 6 časova od izabranog). Uplate: unos, izmena i brisanje (evidencija novca).',
              'Klijenti, instruktori, vrste/kategorije/programi/učionice, blokade, dnevnik, podešavanja i bekap.',
              'Pregled „kao instruktor“ (Instruktori → Pregled →).',
              'Nova SQL migracija iz koda se pokreće ručno u Supabase SQL Editoru (koraci u KAKO_POKRENUTI_SQL.md).',
            ]}
          />
          <RoleBlock
            title="Predavač (instruktor)"
            badgeClass="bg-stone-700 text-white"
            intro="Ulaz na /dashboard (ne vidi admin meni). Kalendar pokazuje samo NJEGOVE termine, a decu vidi SVU."
            items={[
              'Kalendar: svoj raspored; termin se prevlači mišem u drugo vreme.',
              'Zakazivanje i radionice u svojim terminima: održano, plaćeno, komentar, kategorija, napomena, učionica.',
              'Otkazivanje svog termina (ostaje sivi zapis).',
              'Klijenti: vidi i menja podatke sve dece (osim popusta), dodaje novo dete.',
              'Zahtevi: preuzima časove zakazane bez instruktora, potvrđuje/menja/odbija zahteve učenika.',
              'Uplate: unosi uplate koje je on primio (izmena/brisanje – samo admin).',
              'Podešavanja: nedeljna dostupnost – šta učenik vidi pri „Zatraži termin“.',
            ]}
          />
          <RoleBlock
            title="Učenik / roditelj"
            badgeClass="bg-emerald-700 text-white"
            intro="Nalog povezan sa detetom (registracija na /registracija-ucenik). Ulaz na /ucenik."
            items={[
              'Vidi svoje zakazane časove i stanje plaćenih časova.',
              'Šalje zahtev za novi čas u vremenima kada je predavač dostupan.',
              'Ne vidi tuđu decu, admin deo ni uplate drugih.',
            ]}
          />
        </Sekcija>

        <p>
          <a href="#pocetak" className="text-sm font-medium text-amber-700 hover:underline">
            ↑ Na vrh uputstva
          </a>
          <span className="mx-2 text-stone-300">·</span>
          <Link href="/admin/kalendar" className="text-sm font-medium text-amber-700 hover:underline">
            Kalendar →
          </Link>
        </p>
      </div>
    </div>
  );
}

function RoleBlock({
  title,
  badgeClass,
  intro,
  items,
}: {
  title: string;
  badgeClass: string;
  intro: string;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden">
      <div className={`px-4 py-2 ${badgeClass}`}>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="px-4 py-3 space-y-2">
        <p className="text-sm text-stone-600">{intro}</p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-800 marker:text-amber-600">
          {items.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
