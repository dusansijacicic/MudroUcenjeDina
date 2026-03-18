-- ============================================================
-- SEED: Samo 3 naloga (Dusan, Dina, NekoDete)
-- ============================================================
-- PREREKVIZIT:
--   1. Pokreni FULL_RESET_AND_MIGRATE.sql u SQL Editoru.
--   2. Authentication → Users → Add user (lozinka 123456):
--        dusan.sijacic2@gmail.com   (admin)
--        dina.mateja@yahoo.com      (predavač)
--        nekodete@gmail.com         (učenik)
--   3. Pokreni ceo ovaj fajl u SQL Editoru.
-- ============================================================

-- 0) Provera: Dina mora postojati u auth
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dina.mateja@yahoo.com') THEN
    RAISE EXCEPTION 'NEMA PREDAVAČA U AUTH. Dodaj dina.mateja@yahoo.com u Authentication → Users (lozinka 123456), pa ponovo pokreni seed.';
  END IF;
END $$;

-- 1) Očisti sve podatke iz aplikativnih tabela
TRUNCATE predavanja, zahtevi_za_cas, terms, instructor_clients, clients, instructor_availability_periods, instructor_weekly_availability, instructors, admin_users RESTART IDENTITY CASCADE;

-- 2) Dusan = super admin
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'dusan.sijacic2@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- 3) Dina = predavač
INSERT INTO instructors (user_id, ime, prezime, email, color)
SELECT id, 'Dina', 'Mateja', 'dina.mateja@yahoo.com', '#EC4899'
FROM auth.users WHERE email = 'dina.mateja@yahoo.com'
ON CONFLICT (user_id) DO NOTHING;

-- 4) Klijenti za Dinu (6), uključujući NekoDete sa login_email
INSERT INTO clients (ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, login_email)
VALUES ('Marko', 'Marković', 2010, '7', 'OS Vuk Karadžić', 'Ana Marković', '061 111 2222', NULL);
INSERT INTO instructor_clients (instructor_id, client_id, placeno_casova)
SELECT i.id, c.id, 5 FROM instructors i, clients c WHERE i.email = 'dina.mateja@yahoo.com' AND c.ime = 'Marko' AND c.prezime = 'Marković' LIMIT 1;

INSERT INTO clients (ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, login_email)
VALUES ('Jovana', 'Jovanović', 2012, '5', 'OS Dušan Silni', 'Miloš Jovanović', '062 333 4444', NULL);
INSERT INTO instructor_clients (instructor_id, client_id, placeno_casova)
SELECT i.id, c.id, 3 FROM instructors i, clients c WHERE i.email = 'dina.mateja@yahoo.com' AND c.ime = 'Jovana' AND c.prezime = 'Jovanović' LIMIT 1;

INSERT INTO clients (ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, login_email)
VALUES ('Neko', 'Dete', 2011, '6', 'OS Sveti Sava', 'Roditelj Dete', '063 555 6666', 'nekodete@gmail.com');
INSERT INTO instructor_clients (instructor_id, client_id, placeno_casova)
SELECT i.id, c.id, 8 FROM instructors i, clients c WHERE i.email = 'dina.mateja@yahoo.com' AND c.ime = 'Neko' AND c.prezime = 'Dete' LIMIT 1;

INSERT INTO clients (ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, login_email)
VALUES ('Teodora', 'Petrović', 2009, '8', 'OS Kralj Petar', 'Ivan Petrović', '064 777 8888', NULL);
INSERT INTO instructor_clients (instructor_id, client_id, placeno_casova)
SELECT i.id, c.id, 10 FROM instructors i, clients c WHERE i.email = 'dina.mateja@yahoo.com' AND c.ime = 'Teodora' AND c.prezime = 'Petrović' LIMIT 1;

INSERT INTO clients (ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, login_email)
VALUES ('Luka', 'Nikolić', 2013, '4', 'OS Njegoš', 'Jelena Nikolić', '065 999 0000', NULL);
INSERT INTO instructor_clients (instructor_id, client_id, placeno_casova)
SELECT i.id, c.id, 2 FROM instructors i, clients c WHERE i.email = 'dina.mateja@yahoo.com' AND c.ime = 'Luka' AND c.prezime = 'Nikolić' LIMIT 1;

INSERT INTO clients (ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, login_email)
VALUES ('Mila', 'Đorđević', 2011, '6', 'OS Vuk Karadžić', 'Stefan Đorđević', '066 123 4567', NULL);
INSERT INTO instructor_clients (instructor_id, client_id, placeno_casova)
SELECT i.id, c.id, 6 FROM instructors i, clients c WHERE i.email = 'dina.mateja@yahoo.com' AND c.ime = 'Mila' AND c.prezime = 'Đorđević' LIMIT 1;

-- 5) Termini: samo za Dinu, ponedeljak–petak naredne nedelje, slotovi 0–8
DO $$
DECLARE
  next_monday DATE;
  d DATE;
  day_off INT;
  s INT;
  din_id UUID;
BEGIN
  SELECT id INTO din_id FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;
  IF din_id IS NULL THEN RETURN; END IF;
  next_monday := CURRENT_DATE + CASE WHEN EXTRACT(ISODOW FROM CURRENT_DATE) = 1 THEN 7 ELSE (8 - EXTRACT(ISODOW FROM CURRENT_DATE)::int) END;
  FOR day_off IN 0..4 LOOP
    d := next_monday + day_off;
    FOR s IN 0..8 LOOP
      INSERT INTO terms (instructor_id, date, slot_index) VALUES (din_id, d, s)
      ON CONFLICT (instructor_id, date, slot_index) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- 6) Predavanja: Dina – nekoliko za prvi dan naredne nedelje
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
  JOIN clients c ON c.id = ic.client_id AND c.ime = 'Neko' AND c.prezime = 'Dete'
  WHERE t.slot_index = 0 AND t.date = next_monday LIMIT 1;

  INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
  SELECT t.id, c.id, true, true, 'Matematika - jednačine.'
  FROM terms t
  JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
  JOIN instructor_clients ic ON ic.instructor_id = i.id
  JOIN clients c ON c.id = ic.client_id AND c.ime = 'Marko' AND c.prezime = 'Marković'
  WHERE t.slot_index = 1 AND t.date = next_monday LIMIT 1;

  INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
  SELECT t.id, c.id, true, false, 'Čitanje.'
  FROM terms t
  JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
  JOIN instructor_clients ic ON ic.instructor_id = i.id
  JOIN clients c ON c.id = ic.client_id AND c.ime = 'Jovana' AND c.prezime = 'Jovanović'
  WHERE t.slot_index = 2 AND t.date = next_monday LIMIT 1;
END $$;

-- 7) Nedeljna dostupnost: samo Dina, Pon–Pet, slotovi 1–10
DO $$
DECLARE
  din_id UUID;
  d INT;
  s INT;
BEGIN
  SELECT id INTO din_id FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;
  IF din_id IS NULL THEN RETURN; END IF;
  FOR d IN 1..5 LOOP
    FOR s IN 1..10 LOOP
      INSERT INTO instructor_weekly_availability (instructor_id, day_of_week, slot_index)
      VALUES (din_id, d, s)
      ON CONFLICT (instructor_id, day_of_week, slot_index) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- 8) Zahtevi za čas: pending + jedan potvrđen (NekoDete)
DO $$
DECLARE
  c_id UUID;
  i_id UUID;
  next_monday DATE;
  term_id UUID;
  pred_id UUID;
BEGIN
  SELECT id INTO c_id FROM clients WHERE login_email = 'nekodete@gmail.com' LIMIT 1;
  SELECT id INTO i_id FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;
  IF c_id IS NULL OR i_id IS NULL THEN RETURN; END IF;

  next_monday := CURRENT_DATE + CASE WHEN EXTRACT(ISODOW FROM CURRENT_DATE) = 1 THEN 7 ELSE (8 - EXTRACT(ISODOW FROM CURRENT_DATE)::int) END;

  INSERT INTO zahtevi_za_cas (client_id, instructor_id, requested_date, requested_slot_index, status)
  VALUES (c_id, i_id, next_monday + 2, 3, 'pending');

  SELECT p.term_id, p.id INTO term_id, pred_id
  FROM predavanja p
  JOIN terms t ON t.id = p.term_id AND t.instructor_id = i_id
  WHERE p.client_id = c_id
  ORDER BY t.date DESC, t.slot_index DESC
  LIMIT 1;
  IF term_id IS NOT NULL AND pred_id IS NOT NULL THEN
    INSERT INTO zahtevi_za_cas (client_id, instructor_id, requested_date, requested_slot_index, status, resolved_at, resolved_by, created_term_id, created_predavanje_id)
    SELECT c_id, i_id, t.date, t.slot_index, 'confirmed', NOW() - INTERVAL '2 days', i_id, term_id, pred_id
    FROM terms t WHERE t.id = term_id;
  END IF;
END $$;

-- 9) Poveži učenika nekodete@gmail.com sa klijentom Neko Dete
UPDATE clients
SET user_id = (SELECT id FROM auth.users WHERE email = 'nekodete@gmail.com' LIMIT 1)
WHERE login_email = 'nekodete@gmail.com';
