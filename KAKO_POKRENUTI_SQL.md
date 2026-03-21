# Kako pokrenuti SQL u Supabase-u

SQL fajlovi iz projekta **ne pokreću se automatski**. Morate ih ručno izvršiti u Supabase Dashboardu.

## Koraci

1. **Otvori Supabase**  
   Uloguj se na [supabase.com](https://supabase.com) i izaberi svoj projekat.

2. **Otvori SQL Editor**  
   U levom meniju klikni na **SQL Editor** (ikona </>).

3. **Pokreni migracije redom** – svaku u **novoj** query kartici:

   ### Prva migracija (001)
   - Klikni **+ New query**.
   - Otvori fajl `supabase/migrations/001_initial.sql` iz ovog projekta.
   - Kopiraj **ceo sadržaj** (Ctrl+A, Ctrl+C) i nalepi u SQL Editor (Ctrl+V).
   - Klikni **Run** (ili Ctrl+Enter).
   - Na dnu treba da piše da je upit uspešno izvršen (zeleno). Ako piše greška, proveri da li si već ranije pokrenuo ovu migraciju (tabele već postoje).

   ### Druga migracija (002)
   - Ponovo **+ New query**.
   - Kopiraj ceo sadržaj iz `supabase/migrations/002_predavanja_i_ucenik.sql`.
   - Nalepi u editor i klikni **Run**.
   - **Napomena:** 002 menja strukturu (dodaje predavanja, itd.). Pokreći **samo ako ste već pokrenuli 001**.

   ### Treća migracija (003)
   - Ponovo **+ New query**.
   - Kopiraj ceo sadržaj iz `supabase/migrations/003_instructor_color.sql`.
   - Nalepi i **Run**.

   ### Četvrta migracija (004) – admin
   - Kopiraj i pokreni `supabase/migrations/004_admin_users.sql`.

   ### Peta migracija (005) – RLS fix za admin
   - Kopiraj i pokreni `supabase/migrations/005_admin_users_select_fix.sql`.

   ### Šesta migracija (006) – više predavača po klijentu
   - Kopiraj i pokreni `supabase/migrations/006_instructor_clients_many_to_many.sql`.
   - Dodaje tabelu `instructor_clients` i uklanja `instructor_id` iz `clients` (jedno dete može imati više predavača).

   ### Sedma migracija (007) – predavači vide ko drži čas u istom terminu
   - Kopiraj i pokreni `supabase/migrations/007_instructors_read_all_terms.sql`.
   - Dozvoljava predavačima da čitaju sve termine i predavanja (da vide ko još drži čas u istom slotu).

   ### Osma migracija (008) – učenik vidi ko je držao termin
   - Kopiraj i pokreni `supabase/migrations/008_clients_read_terms_instructors.sql`.
   - Dozvoljava učeniku (klijentu) da čita termine i predavače za svoja predavanja (ko je držao čas, šta je rađeno).

   ### Deveta migracija (009) – zahtevi za čas
   - Kopiraj i pokreni `supabase/migrations/009_zahtevi_za_cas.sql`.
   - Tabela zahtevi_za_cas: klijent šalje zahtev (predavač, datum, slot), predavač potvrdi ili promeni termin.

   ### Jedanaesta migracija (011) – zauzeti slotovi pri zakazivanju
   - Kopiraj i pokreni `supabase/migrations/011_occupied_slots_rpc.sql`.
   - RPC `get_occupied_slots(datum)`: klijent pri „Zatraži zakazivanje časa” vidi koji slotovi su zauzeti (označeno „zauzeto”).

   ### Dvanaesta migracija (012) – dostupnost predavača
   - Kopiraj i pokreni `supabase/migrations/012_instructor_availability.sql`.
   - Tabele `instructor_weekly_availability` i `instructor_availability_periods`; RPC `get_instructor_available_slots(instructor_id, datum)`. Predavač u Podešavanjima postavlja kada je dostupan; klijent pri zakazivanju vidi samo te slotove (spojene u blokove).

   ### Dvadeset prva migracija (021) – datum testiranja klijenta
   - Kopiraj i pokreni `supabase/migrations/021_client_datum_testiranja.sql`.
   - Dodaje kolonu `clients.datum_testiranja` (opciono); liste klijenata u aplikaciji sortiraju se po ovom datumu (noviji prvi).

   ### Dvadeset druga migracija (022) – datum testiranja pri registraciji učenika
   - Kopiraj i pokreni `supabase/migrations/022_link_client_datum_testiranja.sql`.
   - Proširuje `link_client_to_user` opcionim datumom (forma „Registracija učenika” može da ga pošalje).

4. **Provera**  
   U levom meniju otvori **Table Editor**. Trebalo bi da vidiš tabele: `instructors`, `clients`, `terms`, `predavanja`, `admin_users`, `instructor_clients`. Ako ih nema, vrati se na korak 3 i pokreni migracije redom.

---

**Rezime:** Sve tri migracije se izvršavaju **u Supabase-u**, u **SQL Editor** prozoru, jednu za drugom. Ne treba ništa pokretati u terminalu za SQL.
