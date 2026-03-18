# Reset baze i seed (sve odjednom)

## Korak 1: Potpuni reset i šema

1. Otvori **Supabase Dashboard** → **SQL Editor**.
2. Otvori fajl **`FULL_RESET_AND_MIGRATE.sql`** iz ovog foldera.
3. Kopiraj **ceo sadržaj** (Ctrl+A, Ctrl+C) i nalepi u SQL Editor.
4. Klikni **Run**. Trebalo bi da prođe bez greške – baza se ruši i sve tabele/politike/funkcije se kreiraju iznova.

## Korak 2: Auth korisnici (ako koristiš seed)

U **Authentication** → **Users** ručno kreiraj korisnike koje seed očekuje (vidi komentar na početku `seed_mock_data.sql`), npr.:

- `dusan.sijacic2@gmail.com` (admin)
- `dina.mateja@yahoo.com` (predavač)
- `nekodete@gmail.com` (učenik)
- Opciono: `predavac1@test.com` … `predavac20@test.com` (seed ih može kreirati ako uključi pgcrypto i INSERT u auth.users)

Ako seed već kreira auth usere (predavac1..20), onda samo dodaj tri glavna ako ih nema.

## Korak 3: Seed podaci

1. U SQL Editor **nova kartica** (+ New query).
2. Otvori **`seed_mock_data.sql`**, kopiraj ceo sadržaj i nalepi.
3. **Run**. Unosi se ~20 predavača, klijenti, termini, predavanja, dostupnost, itd.

Završeno – možeš testirati aplikaciju.
