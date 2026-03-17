-- ============================================================
-- SEED: Mock podaci za testiranje
-- ============================================================
-- PREREKVIZIT: U Supabase Authentication -> Users ručno dodaj 3 korisnika:
--   (Supabase zahteva lozinku najmanje 6 znakova – ne koristi "1234"!)
--   1. dusan.sijacic2@gmail.com   lozinka: 123456  (super admin)
--   2. dina.mateja@yahoo.com      lozinka: 123456  (predavač)
--   3. nekodete@gmail.com         lozinka: 123456  (učenik)
-- Zatim pokreni ovaj ceo fajl u SQL Editoru.
-- ============================================================

-- 1) Dusan = super admin
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'dusan.sijacic2@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- 2) Dina = predavač
INSERT INTO instructors (user_id, ime, prezime, email, color)
SELECT id, 'Dina', 'Mateja', 'dina.mateja@yahoo.com', '#EC4899'
FROM auth.users WHERE email = 'dina.mateja@yahoo.com'
ON CONFLICT (user_id) DO NOTHING;

-- 3) Klijenti za Dinu (jedan od njih = Neko Dete, učenik)
INSERT INTO clients (instructor_id, ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, placeno_casova, login_email)
SELECT id, 'Marko', 'Marković', 2010, '7', 'OS Vuk Karadžić', 'Ana Marković', '061 111 2222', 5, NULL
FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;

INSERT INTO clients (instructor_id, ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, placeno_casova, login_email)
SELECT id, 'Jovana', 'Jovanović', 2012, '5', 'OS Dušan Silni', 'Miloš Jovanović', '062 333 4444', 3, NULL
FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;

INSERT INTO clients (instructor_id, ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, placeno_casova, login_email)
SELECT id, 'Neko', 'Dete', 2011, '6', 'OS Sveti Sava', 'Roditelj Dete', '063 555 6666', 8, 'nekodete@gmail.com'
FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;

INSERT INTO clients (instructor_id, ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, placeno_casova, login_email)
SELECT id, 'Teodora', 'Petrović', 2009, '8', 'OS Kralj Petar', 'Ivan Petrović', '064 777 8888', 10, NULL
FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;

INSERT INTO clients (instructor_id, ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, placeno_casova, login_email)
SELECT id, 'Luka', 'Nikolić', 2013, '4', 'OS Njegoš', 'Jelena Nikolić', '065 999 0000', 2, NULL
FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;

INSERT INTO clients (instructor_id, ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, placeno_casova, login_email)
SELECT id, 'Mila', 'Đorđević', 2011, '6', 'OS Vuk Karadžić', 'Stefan Đorđević', '066 123 4567', 6, NULL
FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;

-- 4) Termini (ponedeljak–petak ove i sledeće nedelje, slotovi 0-4)
DO $$
DECLARE
  did UUID;
  d DATE;
  s INT;
  i INT;
  start_week DATE;
BEGIN
  SELECT id INTO did FROM instructors WHERE email = 'dina.mateja@yahoo.com' LIMIT 1;
  IF did IS NULL THEN RETURN; END IF;
  start_week := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7);
  FOR i IN 0..9 LOOP
    d := start_week + i;
    IF EXTRACT(DOW FROM d) BETWEEN 1 AND 5 THEN
      FOR s IN 0..4 LOOP
        INSERT INTO terms (instructor_id, date, slot_index) VALUES (did, d, s)
        ON CONFLICT (instructor_id, date, slot_index) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 5) Predavanja (povezujemo klijente sa terminima)
INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
SELECT t.id, c.id, true, true, 'Rad na pismenom iz srpskog.'
FROM terms t
JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Neko' AND c.prezime = 'Dete'
WHERE t.slot_index = 0 AND t.date = (SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE + 1)
LIMIT 1;

INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
SELECT t.id, c.id, true, true, 'Matematika - jednačine.'
FROM terms t
JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Marko'
WHERE t.slot_index = 1 AND t.date = (SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE + 1)
LIMIT 1;

INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
SELECT t.id, c.id, true, false, 'Čitanje i razumevanje teksta.'
FROM terms t
JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Jovana'
WHERE t.slot_index = 2 AND t.date = (SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE + 1)
LIMIT 1;

INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
SELECT t.id, c.id, true, true, 'Priprema za kontrolni.'
FROM terms t
JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Teodora'
WHERE t.slot_index = 0 AND t.date = (SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE + 2)
LIMIT 1;

INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
SELECT t.id, c.id, true, true, 'Ponavljanje gradiva.'
FROM terms t
JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Mila'
WHERE t.slot_index = 0 AND t.date = (SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE + 3)
LIMIT 1;

INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
SELECT t.id, c.id, true, true, 'Sastav - opis.'
FROM terms t
JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Neko' AND c.prezime = 'Dete'
WHERE t.slot_index = 1 AND t.date = (SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE + 4)
LIMIT 1;

INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
SELECT t.id, c.id, true, true, 'Geometrija.'
FROM terms t
JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Marko'
WHERE t.slot_index = 0 AND t.date = (SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE + 5)
LIMIT 1;

-- 6) Poveži učenika NekoDete sa klijentom (user_id iz auth.users)
UPDATE clients
SET user_id = (SELECT id FROM auth.users WHERE email = 'nekodete@gmail.com' LIMIT 1)
WHERE login_email = 'nekodete@gmail.com' AND user_id IS NULL;
