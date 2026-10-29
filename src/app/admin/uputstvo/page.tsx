import Link from 'next/link';

/**
 * Uputstvo klik po klik za svaku admin stranicu. Vidljivo samo adminima – provera je u
 * src/app/admin/layout.tsx. Dugme „Uputstvo“ u meniju vodi direktno na sekciju za stranicu na kojoj
 * se korisnik nalazi (id-jevi sekcija ispod moraju da odgovaraju mapi u AdminNav.tsx).
 */

const SADRZAJ: { id: string; naslov: string }[] = [
  { id: 'pocetak', naslov: 'Tipičan dan – brzi početak' },
  { id: 'kalendar', naslov: 'Kalendar' },
  { id: 'kalendar-modovi', naslov: 'Kalendar – dugmad Swap, Copy, Delete…' },
  { id: 'zakazivanje-termina', naslov: 'Zakaži termin' },
  { id: 'termin', naslov: 'Stranica termina' },
  { id: 'klijenti', naslov: 'Klijenti (lista)' },
  { id: 'profil-klijenta', naslov: 'Profil deteta' },
  { id: 'uplate', naslov: 'Evidencija uplata' },
  { id: 'blokirani', naslov: 'Blokirani termini' },
  { id: 'testiranja', naslov: 'Testiranja' },
  { id: 'instruktori', naslov: 'Instruktori' },
  { id: 'sifarnici', naslov: 'Vrste časova, kategorije, programi, učionice' },
  { id: 'dnevnik', naslov: 'Dnevnik aktivnosti' },
  { id: 'podesavanja', naslov: 'Podešavanja i bekap' },
  { id: 'uloge', naslov: 'Ko šta sme (uloge)' },
];

export default function AdminUputstvoPage() {
  return (
    <div className="max-w-6xl pb-16 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10">
      <aside className="mb-8 lg:mb-0">
        <nav aria-label="Sadržaj uputstva" className="lg:sticky lg:top-4 rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Sadržaj</p>
          <ul className="space-y-1">
            {SADRZAJ.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-stone-700 hover:bg-amber-50 hover:text-amber-800">
                  {s.naslov}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="min-w-0 max-w-3xl space-y-10">
        <header>
          <h1 className="text-2xl font-semibold text-stone-800 mb-2">Uputstvo</h1>
          <p className="text-stone-600 text-sm leading-relaxed">
            Kako se radi na svakoj stranici, korak po korak. Dugme <Ui>Uputstvo</Ui> u gornjem meniju uvek otvara deo
            uputstva za stranicu na kojoj se trenutno nalazite.
          </p>
        </header>

        <Sekcija id="pocetak" naslov="Tipičan dan – brzi početak">
          <Koraci>
            <li>Otvorite <Ui>Kalendar</Ui> – vidite ovu i sledeću nedelju za sve instruktore.</li>
            <li>Novo dete ili novi čas: gore levo kliknite <Ui>+ Zakaži termin</Ui> (ili <Ui>+</Ui> u praznoj ćeliji kalendara).</li>
            <li>Kad roditelj plati: kliknite <Ui>+ Unesi uplatu</Ui> u meniju (ili <Ui>+ Dodaj uplatu</Ui> na profilu deteta).</li>
            <li>
              Proverite neplaćeno: na kalendaru crveni red sa <span className="rounded bg-red-600 px-1 text-xs font-bold text-white">! 11/10</span>{' '}
              znači da čas nije plaćen; na stranici <Ui>Klijenti</Ui> crveno „nije plaćeno N“.
            </li>
            <li>Kraj dana: u <Ui>Podešavanja</Ui> preuzmite bekap baze (preporuka: jednom dnevno).</li>
          </Koraci>
        </Sekcija>

        <Sekcija id="kalendar" naslov="Kalendar">
          <Podnaslov>Pregled i kretanje</Podnaslov>
          <Koraci>
            <li>Gore desno birate prikaz: <Ui>Dan</Ui>, <Ui>Nedelja</Ui> (ova + sledeća nedelja) ili <Ui>Mesec</Ui>.</li>
            <li>Za prethodni/sledeći period kliknite <Ui>← Prethodna</Ui> / <Ui>Sledeća →</Ui> u traci sa dugmićima (traka ostaje na vrhu dok skrolujete).</li>
            <li>Pređite mišem preko ćelije – ljubičasto se obeleže dan i vreme, da lakše pratite red i kolonu.</li>
          </Koraci>

          <Podnaslov>Kako čitati termin</Podnaslov>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-800 marker:text-amber-600">
            <li>Gore levo u terminu je instruktor (boja slova = boja instruktora iz legende), desno vrsta časa i učionica (siva oznaka).</li>
            <li>
              Svako dete je u svom redu. Boje redova (žuta, plava, zelena…) idu redom unutar istog vremena – da se na prvi pogled vidi
              koliko je dece u isto vreme.
            </li>
            <li>
              Desno od imena: <strong>x/y · još N</strong> = ovo je x-ti čas te vrste od y plaćenih, posle njega ostaje još N plaćenih.{' '}
              <span className="font-bold text-amber-700">10/10 · poslednji</span> = poslednji plaćeni čas (vreme za naplatu).{' '}
              <span className="rounded bg-red-600 px-1 text-xs font-bold text-white">! 11/10</span> u crvenom redu = čas nije plaćen.
            </li>
            <li>Narandžaste kartice sa isprekidanim okvirom = čas zakazan bez instruktora (čeka da ga neki predavač preuzme).</li>
            <li>Sive kartice = otkazani časovi (istorija). Prugasto „⛔ Blokirano“ = u tom vremenu niko ne može da zakaže.</li>
            <li>
              U jednom vremenu (npr. 9:00) može biti više paralelnih termina – svaki svoj instruktor i svoja učionica (koliko najviše,
              podešava se u <Ui>Podešavanja</Ui>). Termin može biti individualni (jedno dete) ili grupni (više dece).
            </li>
          </ul>

          <Podnaslov>Filter – samo jedno dete, instruktor ili učionica</Podnaslov>
          <Koraci>
            <li>U polje <Ui>Dete:</Ui> počnite da kucate ime (može i bez kvačica: „djordje“ nalazi „Đorđe“).</li>
            <li>Kliknite dete u listi (ili strelicama + Enter). Kalendar sada pokazuje samo termine tog deteta.</li>
            <li>Ljubičasta traka ispod pokazuje koliko je časova u prikazanom periodu; <Ui>Ceo mesec za ovo dete →</Ui> otvara mesečni pregled.</li>
            <li>Filter ostaje i kad idete na sledeću/prethodnu nedelju ili menjate Dan/Nedelja/Mesec. Uklanja se klikom na <Ui>✕</Ui> pored imena.</li>
            <li>Isto radi i za <Ui>Instruktor:</Ui> i <Ui>Učionica:</Ui> (padajuće liste).</li>
          </Koraci>

          <Podnaslov>Brze radnje na samom kalendaru</Podnaslov>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-800 marker:text-amber-600">
            <li>Klik na termin otvara stranicu termina (deca, uplate, izmena).</li>
            <li>Premeštanje: uhvatite termin mišem i prevucite ga u drugu ćeliju, pa potvrdite.</li>
            <li><Ui>+</Ui> u praznoj ćeliji = novi termin za taj dan i vreme; <Ui>+ Testiranje</Ui> = termin testiranja.</li>
            <li><Ui>+ Dodaj još termin u ovom slotu</Ui> ispod postojećih = još jedan paralelan termin u istom vremenu.</li>
            <li>Žuta traka na vrhu „termini bez instruktora/učionice“: klik na datum vodi pravo do tog časa.</li>
            <li><Ui>🖨 Print / PDF</Ui> = raspored za štampu.</li>
            <li>Kalendar se sam osvežava kad bilo ko nešto promeni (drugi admin, predavač) – ne treba F5.</li>
          </ul>
        </Sekcija>

        <Sekcija id="kalendar-modovi" naslov="Kalendar – dugmad Swap, Copy, Delete…">
          <Napomena>
            Uvek isto: uključite dugme (postane obojeno), kliknite termine na kalendaru, pa potvrdite zelenim dugmetom{' '}
            <Ui>✓ Potvrdi…</Ui> koje se pojavi gore desno, pored <Ui>Print / PDF</Ui>. Ponovni klik na dugme moda ga isključuje.
          </Napomena>

          <Podnaslov>Swap – zamena dva termina</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Swap</Ui>.</li>
            <li>Čekirajte šta se menja: Termin (vreme), Instruktor, Učionica i/ili Klijent.</li>
            <li>Kliknite prvi, pa drugi termin.</li>
            <li>Kliknite <Ui>✓ Potvrdi zamenu</Ui>.</li>
          </Koraci>

          <Podnaslov>Copy – kopiranje termina</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Copy</Ui>, pa termin koji kopirate.</li>
            <li>Čekirajte šta se kopira (instruktor, učionica, dete) i po želji drugu vrstu časa.</li>
            <li>Kliknite jednu ili više praznih ćelija gde ide kopija.</li>
            <li>Kliknite <Ui>✓ Potvrdi kopiranje (N)</Ui>. Održano/plaćeno se ne prenosi.</li>
          </Koraci>

          <Podnaslov>Delete – trajno brisanje</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Delete</Ui>.</li>
            <li>Kliknite termine (može i sive otkazane i narandžaste zahteve) koje brišete – postaju crveno obeleženi.</li>
            <li>Kliknite <Ui>✓ Potvrdi brisanje (N)</Ui>.</li>
          </Koraci>
          <Upozorenje>
            Delete briše BEZ TRAGA. Ako dete samo ne dolazi, koristite <Ui>Otkaži termin</Ui> na stranici termina – tada ostaje sivi zapis u
            istoriji.
          </Upozorenje>

          <Podnaslov>Zakaži više časova – jedno dete (ili grupa) u više termina odjednom</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Zakaži više časova</Ui>.</li>
            <li>Izaberite dete. Za grupu čekirajte <Ui>Grupa (više dece odjednom u istim terminima)</Ui> i označite decu.</li>
            <li>
              Po želji izaberite instruktora, učionicu i vrstu časa. Bez instruktora („bez instruktora (zahtev)“) časovi čekaju da ih predavač
              preuzme; grupa mora imati instruktora.
            </li>
            <li>Kliknite sve ćelije (dan + vreme) gde dete dolazi.</li>
            <li>Kliknite <Ui>✓ Potvrdi zakazivanje (N)</Ui>.</li>
          </Koraci>

          <Podnaslov>Dodeli instruktora/učionicu/vrstu</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Dodeli instruktora/učionicu/vrstu</Ui>.</li>
            <li>Izaberite instruktora i/ili učionicu i/ili vrstu časa (bilo koja kombinacija).</li>
            <li>Kliknite termine i narandžaste časove bez instruktora kojima to dodeljujete.</li>
            <li>Kliknite <Ui>✓ Potvrdi dodelu (N)</Ui>.</li>
          </Koraci>

          <Podnaslov>Blokiraj termin(e) – zatvaranje vremena za zakazivanje</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>Blokiraj termin(e)</Ui>.</li>
            <li>Upišite razlog (npr. praznik, sastanak) – obavezno.</li>
            <li>Kliknite ćelije (dan + vreme) koje zatvarate. Vide se i postojeći časovi u njima.</li>
            <li>
              Kliknite <Ui>✓ Blokiraj (N)</Ui>. Ako je nešto već zakazano, pojaviće se upozorenje; ti časovi ostaju i vide se u{' '}
              <Ui>Blokirani termini</Ui> kao „Treba premestiti“.
            </li>
            <li>Odblokiranje: <Ui>Odblokiraj</Ui> na samoj ćeliji ili na stranici Blokirani termini.</li>
          </Koraci>
        </Sekcija>

        <Sekcija id="zakazivanje-termina" naslov="Zakaži termin">
          <Koraci>
            <li>Kliknite <Ui>+ Zakaži termin</Ui> u meniju (ili <Ui>+</Ui> u ćeliji kalendara – datum i vreme se sami popune).</li>
            <li>Desno: kucajte ime deteta i kliknite ga u listi. Za grupnu kategoriju čekirajte više dece.</li>
            <li>Levo: proverite <Ui>Datum</Ui> i <Ui>Vreme (slot)</Ui>, izaberite <Ui>Kategorija termina</Ui> i vrstu časa.</li>
            <li>
              Instruktor i učionica su po difoltu „Bez instruktora“ / „Bez učionice“. Ako ih ne izaberete, čas čeka da ga neki predavač
              preuzme. Za grupu i testiranje instruktor je obavezan. „(zauzeto)“ znači da instruktor/učionica već ima čas u tom vremenu.
            </li>
            <li>Po želji: <Ui>Napomena za termin</Ui> i „Zakaži isti termin i narednih N dana“ (0 = samo taj dan).</li>
            <li>Kliknite <Ui>Zakaži termin</Ui>. Vraćate se na kalendar, koji se sam pomeri do tog termina i kratko ga zasvetli.</li>
          </Koraci>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-800 marker:text-amber-600">
            <li>Kategorija „Testiranje“: deca se upisuju odmah (ime obavezno) ili kasnije na stranici termina.</li>
            <li>
              Kategorija „Nastavak“: za duži čas koji se nastavlja na prethodni – bira se roditeljski termin, isti instruktor i učionica; ne
              računa se u plaćene časove.
            </li>
            <li>U blokiranom vremenu zakazivanje nije moguće (crvena poruka „Termin je blokiran“).</li>
          </ul>
        </Sekcija>

        <Sekcija id="termin" naslov="Stranica termina">
          <p className="text-sm text-stone-600">Otvara se klikom na termin u kalendaru.</p>
          <Koraci>
            <li>Gore su datum, vreme, instruktor i kategorija. U <Ui>Kategorija i napomena termina</Ui> menjate kategoriju i napomenu.</li>
            <li>
              Kod svakog deteta piše koji je to čas od plaćenih („7. čas od 10 plaćenih · preostalo još 3“) i link{' '}
              <Ui>Profil, uplate i održani časovi →</Ui>.
            </li>
            <li><Ui>+ Dodaj radionicu</Ui> = još jedno dete u ovom terminu (do limita).</li>
            <li><Ui>Izmeni</Ui> kod deteta = održano, plaćeno, vrsta časa, komentar; tamo je i <Ui>Obriši</Ui> (dete izlazi iz termina).</li>
            <li><Ui>Otkaži termin</Ui> = termin se briše sa kalendara, a ostaje sivi zapis u istoriji (za razliku od Delete na kalendaru).</li>
          </Koraci>
        </Sekcija>

        <Sekcija id="klijenti" naslov="Klijenti (lista)">
          <Koraci>
            <li>Pretraga: kucajte ime, prezime, školu ili telefon – lista se filtrira odmah.</li>
            <li>
              Kolona „Održano do danas / kupljeno / preostalo“ po vrsti časa. „Održano“ broji sve časove čije je vreme prošlo. Crveno „nije
              plaćeno N“ = održano je više nego što je plaćeno.
            </li>
            <li>
              <Ui>✓ Označi kao plaćeno</Ui> pored crvenog: potvrdite i upisuje se uplata za te časove (primio Časlav Mančić, datum
              poslednjeg održanog časa, iznos po ceni vrste i popustu deteta). Kasnije se može izmeniti u Evidenciji uplata.
            </li>
            <li>Klik na ime ili <Ui>Profil, uplate i održani časovi →</Ui> otvara profil deteta.</li>
            <li>Novo dete: <Ui>+ Novi klijent</Ui> gore desno → popunite podatke (kontakt telefon je obavezan) → <Ui>Dodaj klijenta</Ui>.</li>
          </Koraci>
        </Sekcija>

        <Sekcija id="profil-klijenta" naslov="Profil deteta">
          <Koraci>
            <li><Ui>Pregled po vrstama časova</Ui>: plaćeno / održano / preostalo za svaku vrstu.</li>
            <li>
              <Ui>Uplate</Ui>: sve uplate deteta sa zbirom. <Ui>+ Dodaj uplatu</Ui> otvara formu odmah tu (dete je već izabrano) →
              popunite → <Ui>Unesi uplatu</Ui>. Kod svake uplate su <Ui>Izmeni</Ui> i <Ui>Obriši</Ui>.
            </li>
            <li>
              <Ui>Pregled termina</Ui>: levo zakazani (isprekidano = još bez instruktora), desno održani. Klik na termin otvara ga.
            </li>
            <li><Ui>Otkazani termini</Ui>: istorija otkazanih; može se označiti naplaćeno ili obrisati.</li>
            <li><Ui>Izmena podataka klijenta</Ui>: ime, kontakt, popust %, programi… → sačuvajte dugmetom na dnu forme.</li>
          </Koraci>
        </Sekcija>

        <Sekcija id="uplate" naslov="Evidencija uplata">
          <Podnaslov>Unos uplate</Podnaslov>
          <Koraci>
            <li>Kliknite <Ui>+ Unesi uplatu</Ui> (meni ili stranica Evidencija uplata).</li>
            <li><Ui>Ko je primio (instruktor)</Ui> – obavezno izabrati.</li>
            <li><Ui>Datum uplate</Ui> – danas po difoltu; ako je novac primljen ranije, izaberite taj dan.</li>
            <li><Ui>Klijent</Ui> – kucajte ime i kliknite dete.</li>
            <li><Ui>Vrsta časa</Ui> i <Ui>Broj časova</Ui> – iznos se sam izračuna (cena × broj − popust deteta).</li>
            <li>Po potrebi <Ui>Popust za ovu uplatu (%)</Ui>, ručno ispravite <Ui>Iznos</Ui>, dodajte <Ui>Napomena</Ui>.</li>
            <li>Kliknite <Ui>Unesi uplatu</Ui>.</li>
          </Koraci>
          <Podnaslov>Izmena i brisanje</Podnaslov>
          <Koraci>
            <li>U listi uplata kliknite <Ui>Izmeni</Ui> → promenite → <Ui>Sačuvaj izmene</Ui>.</li>
            <li><Ui>Obriši</Ui> → potvrdite. Detetu se smanjuje broj plaćenih časova (vidi se i na kalendaru).</li>
          </Koraci>
          <Napomena>Svaka izmena i brisanje upisuje se u Dnevnik aktivnosti sa starim vrednostima – obrisana uplata može ručno da se vrati.</Napomena>
        </Sekcija>

        <Sekcija id="blokirani" naslov="Blokirani termini">
          <Koraci>
            <li>Lista svih blokada (najnovije prve) sa razlogom.</li>
            <li>„Treba premestiti“ = u tom vremenu je ostao zakazan čas – kliknite ga i premestite (ili prevucite na kalendaru).</li>
            <li><Ui>Odblokiraj</Ui> vraća vreme u zakazivanje.</li>
            <li>Nova blokada se pravi na kalendaru dugmetom <Ui>Blokiraj termin(e)</Ui>.</li>
          </Koraci>
        </Sekcija>

        <Sekcija id="testiranja" naslov="Testiranja">
          <Koraci>
            <li>Termin testiranja: na kalendaru <Ui>+ Testiranje</Ui> u ćeliji (ili Zakaži termin → kategorija Testiranje, sa instruktorom).</li>
            <li>Na stranici termina upišite decu (ime, roditelj, telefon, razred).</li>
            <li>Posle testiranja promenite status: Pojavio se / Nije se pojavio, uz komentar.</li>
            <li><Ui>Prebaci u klijenta</Ui> pravi pravog klijenta od potencijalnog.</li>
            <li>Stranica <Ui>Testiranja</Ui> u meniju: istorija svih testiranja sa pretragom po detetu ili roditelju.</li>
          </Koraci>
        </Sekcija>

        <Sekcija id="instruktori" naslov="Instruktori">
          <Koraci>
            <li>Novi: <Ui>Instruktori</Ui> → popunite ime, prezime, email i lozinku za prijavu → <Ui>Kreiraj instruktora</Ui>.</li>
            <li>Izmena: ime, telefon i boja u kalendaru → <Ui>Sačuvaj</Ui>.</li>
            <li>
              <Ui>Suspenduj</Ui>: instruktor se više ne nudi u listama za izbor, a već zakazani termini ostaju. <Ui>Aktiviraj</Ui> ga vraća.
            </li>
            <li><Ui>Pregled →</Ui> kod instruktora: vidite aplikaciju onako kako je vidi on (i dalje ste admin).</li>
          </Koraci>
        </Sekcija>

        <Sekcija id="sifarnici" naslov="Vrste časova, kategorije, programi, učionice">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-800 marker:text-amber-600">
            <li>
              <Ui>Vrste časova</Ui>: naziv, program, cena po času (RSD) i trajanje u minutima. Preko 45 min čas zauzima i sledeći slot.
              Cena se koristi za automatski iznos u uplatama.
            </li>
            <li><Ui>Kategorije termina</Ui>: npr. individualni/grupni – čekirajte „Samo jedno dete u terminu“ za individualne.</li>
            <li><Ui>Programi</Ui>: grupe vrsta časova; „Redosled“ određuje mesto u listi (manji broj = ranije).</li>
            <li><Ui>Učionice</Ui>: naziv učionice → <Ui>Dodaj učionicu</Ui>; <Ui>Izmeni</Ui> za promenu.</li>
            <li>Svuda isto: popunite polja gore → dodaj; u listi <Ui>Izmeni</Ui> ili obriši.</li>
          </ul>
        </Sekcija>

        <Sekcija id="dnevnik" naslov="Dnevnik aktivnosti">
          <Koraci>
            <li>Lista ko je šta uradio i kada (zakazivanje, otkazivanje, uplate, blokade…).</li>
            <li>Filter Admin / Predavač / Sistem i <Ui>Pretraga</Ui> po opisu, imenu ili emailu.</li>
          </Koraci>
        </Sekcija>

        <Sekcija id="podesavanja" naslov="Podešavanja i bekap">
          <Koraci>
            <li>Maks. časova po terminu (koliko dece u jednom terminu) i maks. termina po slotu (koliko paralelnih termina u istom vremenu).</li>
            <li>Kliknite <Ui>Sačuvaj podešavanja</Ui>.</li>
            <li>
              <Ui>⬇ Preuzmi bekap baze (JSON)</Ui> – preuzima kompletnu kopiju podataka. Preporuka: jednom dnevno, fajl čuvajte na sigurnom
              mestu (sadrži lične podatke dece i roditelja).
            </li>
          </Koraci>
        </Sekcija>

        <Sekcija id="uloge" naslov="Ko šta sme (uloge)">
          <RoleBlock
            title="Admin"
            badgeClass="bg-amber-600 text-white"
            intro="Pun pristup – sve stranice iz ovog uputstva. Ulaz na /admin."
            items={[
              'Svi termini svih instruktora, svi modovi na kalendaru (Swap, Copy, Delete, Zakaži više časova, Dodeli, Blokiraj).',
              'Uplate: unos, izmena i brisanje za sve instruktore; „Označi kao plaćeno“ na listi klijenata.',
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

function Sekcija({ id, naslov, children }: { id: string; naslov: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-stone-700 text-white">
        <h2 className="text-lg font-semibold text-balance">{naslov}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </section>
  );
}

function Podnaslov({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-1 text-sm font-semibold text-stone-900">{children}</h3>;
}

/** Numerisani koraci – redosled je bitan (klik po klik). */
function Koraci({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 pl-6 text-sm leading-relaxed text-stone-800 marker:font-bold marker:text-amber-700">
      {children}
    </ol>
  );
}

/** Naziv dugmeta/polja tačno kako piše u aplikaciji. */
function Ui({ children }: { children: React.ReactNode }) {
  return <span className="box-decoration-clone rounded border border-stone-300 bg-stone-50 px-1 py-px text-[0.92em] font-medium text-stone-900">{children}</span>;
}

function Napomena({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-stone-800">{children}</p>;
}

function Upozorenje({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{children}</p>;
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
