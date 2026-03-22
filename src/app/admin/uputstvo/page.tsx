import Link from 'next/link';

/**
 * Vidljivo samo adminima – provera je u src/app/admin/layout.tsx (redirect ako nije u admin_users).
 */
export default function AdminUputstvoPage() {
  return (
    <div className="max-w-3xl space-y-10 pb-12">
      <div>
        <h1 className="text-2xl font-semibold text-stone-800 mb-2">Uputstvo za korišćenje</h1>
        <p className="text-stone-600 text-sm">
          Pregled šta koja uloga sme u aplikaciji <strong>Dina kalendar</strong>. Ova stranica je dostupna samo u{' '}
          <strong>admin režimu</strong> (nalog u tabeli <code className="text-xs bg-stone-200 px-1 rounded">admin_users</code>
          ).
        </p>
      </div>

      <RoleBlock
        title="Admin (super admin)"
        badgeClass="bg-amber-600 text-white"
        intro="Pun pristup administraciji i podacima cele škole/centra. Ulogovan na /admin."
        items={[
          'Instruktori: pregled, dodavanje novih instruktora (vezivanje na Auth nalog).',
          'Klijenti (deca): pregled svih, izmena svih podataka, uključujući popust (%), datum testiranja, napomenu.',
          'Evidencija uplata: unos i pregled uplata (po instruktoru, klijentu, vrsti časa).',
          'Vrste časova i Kategorije termina: CRUD (cene, tip časa; „jedno dete“ vs grupa u terminu).',
          'Učionice: dodavanje i izmena učionica (boje, nazivi).',
          'Kalendar: pregled termina; zakazivanje termina u ime bilo kog instruktora (+ radionice).',
          'Podešavanja: maks. broj radionica po terminu, maks. broj termina u istom vremenskom slotu.',
          'Može otkazati termine, menjati meta podatke termina (kategorija, napomena) i radionice u admin prikazu.',
          'Pregled „kao instruktor“ (view) ako koristite te linkove – i dalje admin nalog.',
        ]}
      />

      <RoleBlock
        title="Predavač (instruktor)"
        badgeClass="bg-stone-700 text-white"
        intro="Ulogovan na /dashboard (ne vidi /admin meni). Vidi samo svoje termine i klijente sa kojima je povezan."
        items={[
          'Kalendar / dashboard: svoj nedeljni raspored, termini gde je on predavač.',
          'Termini: dodavanje radionica (dece) u svoj termin, izmena održano/plaćeno/komentar, otkazivanje svog termina gde je dozvoljeno.',
          'Kategorija termina i napomena termina: može menjati u okviru forme radionice ili na stranici termina (napomena).',
          'Klijenti: lista „Moji klijenti“ – samo oni u vezi preko sistema (instructor–klijent). Može dodati novog klijenta i vezati ga za sebe, menjati podatke tih klijenata (uključujući napomenu). Ne menja admin-only polja kao što je popust na nivou klijenta (to radi admin).',
          'Zahtevi: obrađuje zahteve učenika za čas (potvrda, promena termina, odbijanje).',
          'Uplate: može unositi evidenciju uplata za sebe (ako je omogućeno u vašoj konfiguraciji).',
          'Podešavanja (dashboard): nedeljna dostupnost i periodi – šta učenik vidi pri „Zatraži termin“.',
          'Ne sme: pristupiti admin stranicama, menjati tuđe instruktore, globalna podešavanja, brisati bilo kog klijenta van svoje liste bez admin prava.',
        ]}
      />

      <RoleBlock
        title="Klijent / učenik"
        badgeClass="bg-emerald-700 text-white"
        intro="Nalog povezan sa redom u tabeli clients (npr. posle registracije na /registracija-ucenik). Ulaz na /ucenik."
        items={[
          'Na /ucenik/profil može uneti ili izmeniti pol i datum testiranja; ime i prezime unosi predavač u kartici klijenta.',
          'Pri registraciji može uneti pol i datum testiranja (ako instruktor nije uneo email za prijavu, prvo ga tražiti).',
          'Vidi sopstvene zakazane časove i kalendar vezan za svog predavača.',
          'Može poslati zahtev za novi čas (datum/slot) u okviru pravila dostupnosti predavača.',
          'Ne vidi: tuđe klijente, admin panel, uplate drugih, podešavanja škole.',
          'Ne može menjati termine drugih učenika niti podatke drugih klijenata.',
        ]}
      />

      <section className="rounded-xl border border-stone-200 bg-amber-50/60 px-4 py-3 text-sm text-stone-700">
        <p className="font-medium text-stone-800 mb-1">Napomena</p>
        <p>
          Tačan opseg dugmadi i formi zavisi od verzije aplikacije; ako nešto nedostaje u listi, proverite da li je uloga ispravno
          dodeljena (admin u <code className="text-xs bg-white/80 px-1 rounded">admin_users</code>, instruktor u{' '}
          <code className="text-xs bg-white/80 px-1 rounded">instructors</code>, učenik sa <code className="text-xs bg-white/80 px-1 rounded">clients.user_id</code>).
        </p>
      </section>

      <p>
        <Link href="/admin" className="text-sm text-amber-700 hover:underline font-medium">
          ← Nazad na admin početnu
        </Link>
      </p>
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
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className={`px-4 py-3 ${badgeClass}`}>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="px-4 py-4 space-y-3">
        <p className="text-sm text-stone-600">{intro}</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-stone-800">
          {items.map((line, idx) => (
            <li key={idx} className="marker:text-amber-600">
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
