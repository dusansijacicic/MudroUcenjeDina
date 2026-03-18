-- ============================================================
-- SEED: Samo 3 naloga (Dusan, Dina, NekoDete)
-- ============================================================
-- PREREKVIZIT:
--   1. U Supabase Authentication → Users imaj samo ova 3 korisnika
--      (ako imaš više, obriši ostale ručno ili kroz Dashboard):
--        dusan.sijacic2@gmail.com   (super admin)
--        dina.mateja@yahoo.com      (predavač)
--        nekodete@gmail.com         (učenik/klijent)
--   2. Pokreni FULL_RESET_AND_MIGRATE.sql u SQL Editoru.
--   3. Pokreni ceo ovaj fajl u SQL Editoru.
-- ============================================================

-- 0) Provera: sva tri korisnika moraju postojati u auth
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dusan.sijacic2@gmail.com') THEN
    RAISE EXCEPTION 'NEMA DUSANA U AUTH. Dodaj dusan.sijacic2@gmail.com u Authentication → Users, pa ponovo pokreni seed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dina.mateja@yahoo.com') THEN
    RAISE EXCEPTION 'NEMA DINE U AUTH. Dodaj dina.mateja@yahoo.com u Authentication → Users, pa ponovo pokreni seed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'nekodete@gmail.com') THEN
    RAISE EXCEPTION 'NEMA NEKODETE U AUTH. Dodaj nekodete@gmail.com u Authentication → Users, pa ponovo pokreni seed.';
  END IF;
END $$;

-- 1) Očisti sve podatke iz aplikativnih tabela (redosled zbog FK)
TRUNCATE TABLE
  predavanja,
  zahtevi_za_cas,
  terms,
  instructor_clients,
  clients,
  instructor_availability_periods,
  instructor_weekly_availability,
  instructors,
  admin_users,
  classrooms,
  term_types
RESTART IDENTITY CASCADE;

-- 2) Dusan = super admin
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'dusan.sijacic2@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- 3) Dina = predavač
INSERT INTO instructors (user_id, ime, prezime, email, color)
SELECT id, 'Dina', 'Mateja', 'dina.mateja@yahoo.com', '#EC4899'
FROM auth.users WHERE email = 'dina.mateja@yahoo.com'
ON CONFLICT (user_id) DO NOTHING;

-- 4) Jedan klijent: Neko Dete (uloguje se kao nekodete@gmail.com)
INSERT INTO clients (ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, login_email)
VALUES ('Neko', 'Dete', 2011, '6', 'OS Sveti Sava', 'Roditelj Dete', '063 555 6666', 'nekodete@gmail.com');
INSERT INTO instructor_clients (instructor_id, client_id, placeno_casova)
SELECT i.id, c.id, 5
FROM instructors i, clients c
WHERE i.email = 'dina.mateja@yahoo.com' AND c.login_email = 'nekodete@gmail.com'
LIMIT 1;

-- 5) Učionice (6 soba)
INSERT INTO classrooms (naziv, color) VALUES
  ('Učionica 1', '#0ea5e9'),
  ('Učionica 2', '#22c55e'),
  ('Učionica 3', '#f97316'),
  ('Učionica 4', '#a855f7'),
  ('Učionica 5', '#facc15'),
  ('Učionica 6', '#6b7280');

-- 5b) Vrste termina (obavezno za zakazivanje)
INSERT INTO term_types (naziv, opis) VALUES
  ('Individualni', 'Jedan na jedan'),
  ('Grupni', 'Grupa učenika');

-- 6) Termini: Dina, ponedeljak–petak naredne nedelje, slotovi 0–8, sa učionicama
DO $$
DECLARE
  next_monday DATE;
  d DATE;
  day_off INT;
  s INT;
  din_id UUID;
  room_ids UUID[];
  room_idx INT := 1;
BEGIN
  SELECT id INTO din_id FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;
  IF din_id IS NULL THEN RETURN; END IF;
  SELECT array_agg(id ORDER BY naziv) INTO room_ids FROM classrooms;
  next_monday := CURRENT_DATE + CASE WHEN EXTRACT(ISODOW FROM CURRENT_DATE) = 1 THEN 7 ELSE (8 - EXTRACT(ISODOW FROM CURRENT_DATE)::int) END;
  FOR day_off IN 0..4 LOOP
    d := next_monday + day_off;
    FOR s IN 0..8 LOOP
      IF room_ids IS NOT NULL AND array_length(room_ids, 1) > 0 THEN
        INSERT INTO terms (instructor_id, date, slot_index, classroom_id)
        VALUES (din_id, d, s, room_ids[((room_idx - 1) % array_length(room_ids, 1)) + 1])
        ON CONFLICT (instructor_id, date, slot_index) DO NOTHING;
        room_idx := room_idx + 1;
      ELSE
        INSERT INTO terms (instructor_id, date, slot_index)
        VALUES (din_id, d, s)
        ON CONFLICT (instructor_id, date, slot_index) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 7) Predavanja: Dina – par časova za Neko Dete (prvi dan naredne nedelje)
DO $$
DECLARE
  next_monday DATE;
BEGIN
  next_monday := CURRENT_DATE + CASE WHEN EXTRACT(ISODOW FROM CURRENT_DATE) = 1 THEN 7 ELSE (8 - EXTRACT(ISODOW FROM CURRENT_DATE)::int) END;

  INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
  SELECT t.id, c.id, true, true, 'Rad na pismenom.'
  FROM terms t
  JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
  JOIN instructor_clients ic ON ic.instructor_id = i.id
  JOIN clients c ON c.id = ic.client_id AND c.login_email = 'nekodete@gmail.com'
  WHERE t.slot_index = 0 AND t.date = next_monday
  LIMIT 1;

  INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
  SELECT t.id, c.id, true, false, 'Matematika.'
  FROM terms t
  JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
  JOIN instructor_clients ic ON ic.instructor_id = i.id
  JOIN clients c ON c.id = ic.client_id AND c.login_email = 'nekodete@gmail.com'
  WHERE t.slot_index = 1 AND t.date = next_monday
  LIMIT 1;
END $$;

-- 8) Nedeljna dostupnost: Dina, Pon–Pet, slotovi 0–12
DO $$
DECLARE
  din_id UUID;
  d INT;
  s INT;
BEGIN
  SELECT id INTO din_id FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;
  IF din_id IS NULL THEN RETURN; END IF;
  FOR d IN 1..5 LOOP
    FOR s IN 0..12 LOOP
      INSERT INTO instructor_weekly_availability (instructor_id, day_of_week, slot_index)
      VALUES (din_id, d, s)
      ON CONFLICT (instructor_id, day_of_week, slot_index) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- 9) Poveži učenika nekodete@gmail.com sa klijentom Neko Dete
UPDATE clients
SET user_id = (SELECT id FROM auth.users WHERE email = 'nekodete@gmail.com' LIMIT 1)
WHERE login_email = 'nekodete@gmail.com';
