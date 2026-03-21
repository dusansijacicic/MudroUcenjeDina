# Izveštaj izmena (Dina kalendar)

Datum: mart 2026.

## 1. Kategorije termina kao zasebna tabela (admin CRUD)

- **Baza**
  - Nova migracija `supabase/migrations/024_term_categories_table.sql`: tabela `term_categories` (`naziv`, `opis`, `jedan_klijent_po_terminu`), seed redovi Individualni / Grupni (fiksni UUID-jevi), kolona `terms.term_category_id`, migracija sa starog `terms.kategorija` (TEXT), RLS (svi ulogovani čitaju, menja samo admin).
  - `supabase/migrations/023_term_kategorija_napomene.sql` – ranije dodate napomene + privremena TEXT kategorija; **024** to prebacuje na FK.
  - `supabase/FULL_RESET_AND_MIGRATE.sql` – od početka uključuje `term_categories` i `term_category_id` (bez TEXT `kategorija`).
  - `supabase/seed_mock_data.sql` – `INSERT INTO terms` sada šalje `term_category_id`.

- **Admin UI**
  - `/admin/kategorije-termina` – lista, dodavanje, brisanje (ako kategorija nije u upotrebi).
  - `/admin/kategorije-termina/[id]` – izmena naziva, opisa i „samo jedno dete u terminu”.
  - Link u `AdminNav`: „Kategorije termina”.

- **Backend**
  - `src/app/admin/actions.ts`: `getTermCategories`, CRUD kategorija; `createTermAsAdmin` / `updateTermMetaAsAdmin` koriste `term_category_id`.
  - `src/lib/term-categories.ts`: seed UUID konstante, `jedanKlijentIzJoina`, `nazivKategorijeIzJoina`.

- **Aplikacija**
  - `src/types/database.ts`: `TermCategory`, na `Term` polje `term_category_id` / join.
  - `src/lib/settings.ts`: `termMozeNovoPredavanje` čita `jedan_klijent_po_terminu` preko join-a.
  - Forme i stranice: `PredavanjeForm`, `AdminTerminForm`, `AdminTermMetaForm`, dashboard/admin stranice termina, `zahtevi/actions.ts`, `termin/novi`, itd. – izbor kategorije iz tabele umesto „individualni/grupni” stringa.

- **Dokumentacija**
  - `KAKO_POKRENUTI_SQL.md` – dodata migracija **024** i napomena za FULL_RESET.

---

## 2. Napomene za klijenta i termin (admin i predavač)

- **Klijent (`clients.napomena`)**  
  Već je bilo moguće uneti kroz `ClientForm` (dashboard) i `AdminClientForm` (admin). Dodata su kratka objašnjenja da napomenu vide i predavač i admin.

- **Termin (`terms.napomena`)**
  - Nova server akcija `updateTermNapomenaAsInstructor` u `src/app/dashboard/termin/actions.ts` – menja samo napomenu, bez kategorije.
  - Novi `src/app/dashboard/termin/TermNapomenaEditor.tsx` na stranici `/dashboard/termin/[id]` – predavač može da sačuva napomenu direktno sa detalja termina.
  - U `PredavanjeForm` i `AdminTermMetaForm` – tekst da napomenu mogu unositi i predavač i admin.

---

## Kako primeniti SQL na postojećoj bazi

Ako već imaš migraciju **023**, pokreni zatim **`024_term_categories_table.sql`** u Supabase SQL Editoru.  
Novi projekat: dovoljan je **`FULL_RESET_AND_MIGRATE.sql`** (šema već uključuje `term_categories`).

---

*Fajl generisan radi pregleda izmena pre commit-a.*
