# Ubrzanje kalendara — 18.11.2026.

Analiziran je `supabase/migrations/logs_export.txt` sa 2.131 Vercel log zapisom. Pravi podaci u produkcionoj bazi nisu menjani tokom ove provere.

## Nalazi iz logova

- Zabeleženo je 120 serverskih učitavanja kalendara: medijana 3.111 ms, maksimum 28.661 ms.
- U 95 učitavanja nedostaje funkcija `kalendar_podaci`; umesto jednog poziva aplikacija šalje oko 16 odvojenih upita. Već postojeća migracija 056 nije primenjena u toj produkciji.
- Zabeleženo je 28 korisničkih operacija: medijana 3.957 ms, maksimum 27.616 ms. Najsporija je potvrda zakazivanja.
- Izveštaj iz browsera navodi 841 unapred učitan link za prazne ćelije. Takva učitavanja dele kapacitet servera i baze sa korisničkom operacijom.
- Plaćanje testiranja je prijavilo odsutnu kolonu iz migracije 054.

## Izmene

- U kalendarima je isključen automatski prefetch linkova: same prazne ćelije više ne otvaraju forme u pozadini.
- Forma čuva termin, decu, testiranje i ponavljanje kroz jedan server zahtev, umesto više uzastopnih zahteva koji svaki ponovo renderuju stranicu. Zahtev ima stalan ID za bezbedan ponovni pokušaj; uspešno sačuvan termin i deca se ne dodaju drugi put.
- Učitavanje spiskova u formi i nezavisne provere pri dodavanju časa rade paralelno. Podešavanja se čitaju jednom u okviru zahteva; početna zauzetost se ne traži ponovo čim se forma otvori.
- Navigacija posle zakazivanja ne pokreće dodatni `router.refresh()`.
- Realtime i rezervno osvežavanje dele jednu proveru zahteva koji je već u toku. Realtime čeka završetak operacije. Promene časova bez instruktora, podsetnika, plaćanja, otkazanih časova i blokada sada takođe potvrđuju da je stigao svež kalendar. Poruka primljena tokom učitavanja se ne gubi.
- Filter odmah prikazuje izabrano dete. Dok se čeka kalendar, prikazuje se indikator i sprečava slučajan klik na staru ćeliju.
- Poznato preklapanje izabranog deteta sa časom ili njegovim nastavkom odmah onemogućava izbor. Server i dalje proverava zauzetost pre upisa.
- Ako RPC nedostaje, neuspešan poziv se ne ponavlja na svakoj operaciji; dostupnost se ponovo proverava posle jednog minuta.
- Delete bez traga uklanja oznake plaćanja koje počinju na izabranim obrisanim časovima. Migracija 057 obavlja celo grupno brisanje u jednom transakcionom pozivu. Premeštanje i otkazivanje zadržavaju postojeća pravila.
- Ispravljeni su naslov i godina u podsetniku, oznake trajanja kratkih časova, potvrda brisanja uplate, kontrast iznosa i broja časova, nazivi polja za vrste časova i automatski izbor programa pri unosu novog deteta.

## Primena na postojećoj produkcionoj bazi

Pokrenuti **`supabase/APPLY_PERFORMANCE_FIXES.sql`** u Supabase SQL Editoru, jednom, kao ceo paket. Sadrži migracije 051, 054, 055, 056 i 057 u transakciji. Paket dodaje kolone i definicije funkcija i ne briše postojeće podatke. Ne koristiti `FULL_RESET_AND_MIGRATE.sql` za ovo ažuriranje.

Ovaj korak omogućava jedan poziv za kalendar, plaćanje testiranja i transakciono grupno brisanje. Bez primene paketa plaćanje testiranja i dalje zavisi od nedostajuće kolone, a kalendar ostaje na sporijem rezervnom učitavanju. Za direktnu primenu iz ovog razgovora potrebno je povezati Supabase.

Posle objave koda i primene SQL-a ponoviti otvaranje iste nedelje tri puta, filtriranje po detetu, zakazivanje, dodelu instruktora i označavanje plaćanja. U novim logovima proveriti `jedan poziv`, odsustvo greške `PGRST202` i broj stvarnih učitavanja po operaciji. Nova vremena na produkciji tek tada mogu da se uporede sa navedenim rezultatima; nisu merena lokalnim testovima.

## Provera

Automatski testovi obuhvataju prava instruktora, potpuni raspored, ponovljeno zakazivanje bez duplikata, selektivno uklanjanje početaka plaćanja, transakciono Delete pozivanje, ponovno otkrivanje instalirane migracije, preklapanja dužih časova i koordinaciju Realtime osvežavanja. SQL paket je pripremljen za primenu; nije izvršen nad produkcijom iz ovog razgovora.
