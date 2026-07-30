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
        intro="Pun pristup administraciji i podacima cele škole/centra. Ulogovan na /admin. Sve što ume predavač, ume i admin – plus sledeće:"
        items={[
          'Kalendar (početna posle prijave): pregled svih termina svih instruktora, zakazivanje u ime bilo kog instruktora, "+ Testiranje" prečica na praznom slotu.',
          'Swap mod na kalendaru: čekira se šta se menja (Termin/Instruktor/Učionica/Klijent), klikne se prvi pa drugi termin, "Potvrdi zamenu" – radi trenutno (optimistički), server potvrđuje u pozadini. Samo admin ima ovaj mod.',
          'Otkazani (sivi) termini na kalendaru: admin ih može trajno obrisati sa kalendara (✕ na kartici) – predavač ih samo vidi.',
          'Testiranje: kreira termin za testiranje, upisuje potencijalne klijente (ime, roditelj, telefon), kasnije ih prebacuje u pravog klijenta iz Admin → Testiranja.',
          'Klijenti: pregled i izmena svih, uključujući popust (%), datum testiranja, godište, napomenu; koje Programe i Vrste termina dete pohađa i da li je završeno (koristi se za automatsko sakrivanje "završene" dece iz pretrage).',
          'Instruktori (Predavači): pregled, dodavanje novih (vezivanje na Auth nalog), izmena.',
          'Evidencija uplata: unos i pregled uplata svih instruktora (po instruktoru, klijentu, vrsti časa).',
          'Programi, Vrste termina i Kategorije termina: CRUD (cene, trajanje časa u minutima – duži čas automatski blokira i naredni slot, "jedno dete" vs grupa u terminu, kategorija Testiranje).',
          'Učionice: dodavanje i izmena (boje, nazivi).',
          'Podešavanja: maks. broj radionica po terminu, maks. broj termina u istom vremenskom slotu.',
          'Otkazivanje/brisanje termina, izmena meta podataka termina (kategorija, napomena) i bilo koje radionice.',
          'Pregled "kao instruktor" (Admin → Predavači → dugme "Pregled →" kod željenog instruktora) – i dalje admin nalog.',
          'Kad se u kodu doda nova SQL migracija (npr. nova kolona ili indeks za brzinu), treba je ručno pokrenuti u Supabase SQL Editoru – koraci su u fajlu KAKO_POKRENUTI_SQL.md u repozitorijumu.',
        ]}
      />

      <RoleBlock
        title="Predavač (instruktor)"
        badgeClass="bg-stone-700 text-white"
        intro="Ulogovan na /dashboard (ne vidi /admin meni). Kalendar mu pokazuje samo NJEGOVE termine, ali klijente (decu) vidi SVE – iste kao admin."
        items={[
          'Kalendar / dashboard (početna): svoj nedeljni raspored; termin se može prevući (drag & drop) u drugi slot, ili premestiti dugmetom "Premesti u drugi termin" na stranici radionice.',
          'Zakazivanje: novi termin ili radionica u postojećem terminu, biranje bilo kog klijenta iz cele baze (ne samo "svojih").',
          'Termini: dodavanje/izmena radionica (dece) u svom terminu, izmena održano/plaćeno/komentar, izmena kategorije i napomene termina, izmena učionice.',
          'Otkazivanje: može trajno otkazati (obrisati) sopstveni termin – ostaje samo istorijski zapis, sivo na kalendaru.',
          'Klijenti: vidi i može menjati podatke svih klijenata (uključujući napomenu), dodati novog klijenta. Ne menja admin-only polje popust (%) – to radi samo admin.',
          'Zahtevi: obrađuje zahteve učenika za čas (potvrda, promena termina, odbijanje).',
          'Uplate: unosi evidenciju uplata (za bilo kog klijenta).',
          'Podešavanja (dashboard): nedeljna dostupnost i periodi – šta učenik vidi pri "Zatraži termin".',
          'Ne sme: pristupiti admin stranicama (/admin), Swap modu na kalendaru, brisati otkazane termine sa kalendara, menjati druge instruktore ili globalna podešavanja.',
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
