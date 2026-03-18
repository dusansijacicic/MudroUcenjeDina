# Reset baze i seed (samo 3 naloga)

## Korak 1: Potpuni reset i šema

1. Otvori **Supabase Dashboard** → **SQL Editor**.
2. Otvori fajl **`FULL_RESET_AND_MIGRATE.sql`** iz ovog foldera.
3. Kopiraj **ceo sadržaj** (Ctrl+A, Ctrl+C) i nalepi u SQL Editor.
4. Klikni **Run**. Baza se ruši, auth korisnici se brišu, sve tabele/politike/funkcije se kreiraju iznova.

## Korak 2: Tri Auth korisnika

U **Authentication** → **Users** → **Add user** dodaj **samo ova 3** (lozinka **123456**):

- `dusan.sijacic2@gmail.com` (admin)
- `dina.mateja@yahoo.com` (predavač)
- `nekodete@gmail.com` (učenik)

## Korak 3: Seed podaci

1. U SQL Editor **nova kartica** (+ New query).
2. Otvori **`seed_mock_data.sql`**, kopiraj ceo sadržaj i nalepi.
3. **Run**. Unosi se Dusan (admin), Dina (predavač), 6 klijenata za Dinu (uključujući NekoDete), termini, predavanja, dostupnost, zahtevi; NekoDete se povezuje sa nalogom nekodete@gmail.com.

Završeno – u bazi su samo ova 3 naloga i podaci za njih.
