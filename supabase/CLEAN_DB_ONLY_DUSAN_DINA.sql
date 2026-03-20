-- ============================================================
-- ISPRAZNI BAZU – OSTAVI SAMO DUŠANA (admin) I Dinu (predavač)
-- ============================================================
-- PREREKVIZIT:
--   U Supabase Authentication → Users moraju postojati:
--     dusan.sijacic2@gmail.com
--     dina.mateja@yahoo.com
-- Pokreni ceo fajl u Supabase SQL Editoru (RUN).
-- ============================================================

-- 1) Provera: oba korisnika moraju postojati u auth
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dusan.sijacic2@gmail.com') THEN
    RAISE EXCEPTION 'NEMA DUŠANA U AUTH. Dodaj dusan.sijacic2@gmail.com u Authentication → Users, pa ponovo pokreni.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dina.mateja@yahoo.com') THEN
    RAISE EXCEPTION 'NEMA DINE U AUTH. Dodaj dina.mateja@yahoo.com u Authentication → Users, pa ponovo pokreni.';
  END IF;
END $$;

-- 2) Isprazni sve aplikativne tabele (redosled zbog FK), pa ponovo unesi samo Dušana i Dinu
TRUNCATE TABLE
  predavanja,
  zahtevi_za_cas,
  terms,
  uplate,
  instructor_clients,
  clients,
  instructor_availability_periods,
  instructor_weekly_availability,
  instructors,
  admin_users,
  classrooms,
  term_types,
  app_settings
RESTART IDENTITY CASCADE;

-- 3) Dušan = global admin
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'dusan.sijacic2@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- 4) Dina = predavač
INSERT INTO instructors (user_id, ime, prezime, email, color)
SELECT id, 'Dina', 'Mateja', 'dina.mateja@yahoo.com', '#EC4899'
FROM auth.users WHERE email = 'dina.mateja@yahoo.com'
ON CONFLICT (user_id) DO NOTHING;
