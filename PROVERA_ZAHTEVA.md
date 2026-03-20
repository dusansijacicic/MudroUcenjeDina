# Provera zahteva – šta je urađeno, šta preostaje

## ✅ URAĐENO

### Učionice
- **Dodati učionice** – Admin → Učionice: dodavanje/izmena/brisanje, **naziv + boja**. (Nema fiksno „6 soba” – možeš dodati koliko hoćeš; ako treba tačno 6, može se dodati ograničenje.)
- **Jedna učionica po terminu** – Pri zakazivanju bira se tačno jedna učionica; u slotu ne može ista učionica dva puta (`takenClassroomIds`, unique index `uniq_terms_classroom_date_slot`).
- **Jedan čas u jednoj učionici / jedan instruktor po učionici u slotu** – Jedan termin = jedan predavač + jedna učionica; u istom slotu ista učionica ne može biti dva puta (već pokriveno gore).

### Time slotovi
- **Slotovi od 9** – `TIME_SLOTS` u `src/lib/constants.ts` kreće od **09:00**.

### Evidencija uplata
- **Kada, ko je primio, koliko, vrsta** – Tabela `uplate`: `created_at`, `instructor_id`, `iznos`, `broj_casova`, `term_type_id`. Admin → Evidencija uplata: prikaz **datum i vreme**, **primio (predavač)**, **klijent**, **iznos**, **broj časova**, **vrsta**, **popust %**, **napomena**.

### Cena i popust
- **Cena po vrsti časa** – `term_types.cena_po_casu`; Admin → Vrste časova: unos/izmena cene; pri „Unesi uplatu” prikazuje se cena po vrsti i računa se iznos.
- **Popust** – `clients.popust_percent` (super admin dodeljuje u Admin → Klijenti → [klijent] → Izmena podataka); `uplate.popust_percent` za pojedinačnu uplatu. Uplata form koristi oba.

### Admin kalendar
- **Border = soba (učionica), font = predavač** – U `AdminCalendarView.tsx`: `borderColor: classroomColor`, `color: instructorColor`.
- **Filteri** – Admin kalendar: filter po **predavaču**, po **učionici**, po **detetu (klijentu)** u `AdminCalendarFilters.tsx` i primena u `admin/kalendar/page.tsx`.

### Premestanje termina
- **Obaveštenje pri premestanju** – I u **dashboard** (predavač) i u **admin** kalendaru: `window.confirm('Da li ste sigurni da želite da premestite ovaj termin na novi datum/vreme?')` pre poziva move action.

### Klijent – ko može da menja
- **Super admin može da menja klijenta** – Admin → Klijenti → [klijent]: pun profil, pregled po vrstama, održani/zakazani termini, **Izmena podataka klijenta** (AdminClientForm sa popust_percent itd.). Predavač menja preko dashboard/klijenti/[id].

### Klijent (učenik) – kalendar i legenda
- **Kalendar samo svoje zakazane** – `/ucenik/kalendar`: učitava samo predavanja za tog klijenta, color coding.
- **Legenda: boja okvira = učionica, boja teksta = predavač** – Na stranici kalendara učenika postoji legenda (Učionice / Predavači) i u ćelijama se koristi border = classroom, color = instructor.

### Učenik – stanje po tipu
- **Koliko plaćeno / ostalo po tipu** – Na početnoj učenika (/ucenik): sekcija „Stanje po vrstama časova”: za svaku vrstu gde ima bar jedan kupljen čas prikazuje **uplaćeno**, **održano**, **preostalo** (ostalo = uplaćeno − održano).
- **Cena po času na pregledu učenika** – Ista sekcija prikazuje **cenu po času** iz `term_types.cena_po_casu` (ako je uneta u adminu), pored naziva vrste.
- **Ukupno uplaćeno** – U sekciji „Vaše uplate” prikazuje se zbir svih `uplate.iznos` za tog klijenta (**Ukupno uplaćeno (sve uplate)**).

### Admin / predavač – pregled klijenta
- **Lepši pregled za klijenta** – Admin klijent [id]: **Pregled po vrstama časova** (tabela: vrsta, uplaćeno, održano, preostalo), **Pregled termina** (održani / zakazani sa linkom na termin), **Izmena podataka** (uključujući popust). Dashboard klijent [id]: statistika (plaćeno škola, održano ukupno, preostalo, održano kod vas, plaćeno kod vas), lista predavanja itd.

---

## ⚠️ OPCIONO (proizvodna odluka, ne bug)

1. **„Tačno 6 soba”** – Trenutno nema ograničenja na broj učionica. Ako posao traži strogo 6, dodati proveru u formi ili seed.
2. **„Samo ime učionice”** – Trenutno učionica ima **naziv + boja** (boja za kalendar). Ako treba bez boje, ukloniti iz UI-ja ili ostaviti opciono (u bazi je već opciono).

---

## Rezime

- **Zahtevi iz originalnog spiska su pokriveni** u kodu, uključujući prikaz **cene po času** i **ukupnog uplaćenog** na učenikovoj početnoj (`/ucenik`).
- **Opciono**: ograničenje broja učionica ili pojednostavljenje polja učionice – samo ako posao to eksplicitno traži.
