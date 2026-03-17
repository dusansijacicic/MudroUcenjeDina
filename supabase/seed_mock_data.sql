-- ============================================================
-- SEED: Mock podaci za testiranje
-- ============================================================
-- PREREKVIZIT: U Supabase Authentication -> Users ručno dodaj 3 korisnika:
--   (Supabase zahteva lozinku najmanje 6 znakova!)
--   1. dusan.sijacic2@gmail.com   lozinka: 123456  (super admin)
--   2. dina.mateja@yahoo.com      lozinka: 123456  (predavač)
--   3. nekodete@gmail.com         lozinka: 123456  (učenik)
-- Zatim pokreni ovaj ceo fajl u SQL Editoru.
-- ============================================================
-- Dodatno: seed kreira 20 predavača (predavac1@test.com ... predavac20@test.com, lozinka 123456),
-- po 5–8 klijenata po predavaču, termine za PONEDELJAK–PETAK naredne nedelje.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0) Očisti sve podatke iz aplikativnih tabela (redosled zbog stranih ključeva)
TRUNCATE predavanja, terms, clients, instructors, admin_users RESTART IDENTITY CASCADE;

-- 1) Kreiraj 20 auth korisnika (predavači) + auth.identities, pa 20 redova u instructors
DO $$
DECLARE
  i INT;
  u_id UUID;
  eml TEXT;
  ime TEXT;
  prez TEXT;
  enc_pw TEXT;
BEGIN
  FOR i IN 1..20 LOOP
    eml := 'predavac' || i || '@test.com';
    ime := (ARRAY['Ana','Marko','Jelena','Stefan','Marija','Nikola','Ivana','Luka','Sandra','Dejan','Tamara','Miloš','Katarina','Vladimir','Sonja','Igor','Jovana','Nemanja','Tijana','Bojan'])[i];
    prez := (ARRAY['Petrović','Jovanović','Nikolić','Đorđević','Ilić','Kostić','Popović','Simić','Todorović','Stojanović','Pavlović','Milošević','Antić','Marjanović','Lazić','Vuković','Radovanović','Živković','Stefanović','Mitić'])[i];

    SELECT id INTO u_id FROM auth.users WHERE email = eml LIMIT 1;
    IF u_id IS NULL THEN
      u_id := gen_random_uuid();
      enc_pw := crypt('123456', gen_salt('bf'));
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) VALUES (
        u_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        eml, enc_pw, NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()
      );
      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at
      ) VALUES (
        u_id, u_id, u_id::TEXT, jsonb_build_object('sub', u_id::TEXT, 'email', eml),
        'email', NOW(), NOW(), NOW()
      );
    END IF;

    INSERT INTO instructors (user_id, ime, prezime, email, color)
    VALUES (
      u_id, ime, prez, eml,
      (ARRAY['#EC4899','#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#06B6D4','#84CC16','#F97316','#6366F1','#14B8A6','#A855F7','#EAB308','#22C55E','#EC4899','#0EA5E9','#F43F5E','#78716C','#0D9488','#C026D3'])[i]
    )
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;

-- 2) Dusan = super admin (mora postojati u auth.users)
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'dusan.sijacic2@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- 3) Dina = predavač (mora postojati u auth.users)
INSERT INTO instructors (user_id, ime, prezime, email, color)
SELECT id, 'Dina', 'Mateja', 'dina.mateja@yahoo.com', '#EC4899'
FROM auth.users WHERE email = 'dina.mateja@yahoo.com'
ON CONFLICT (user_id) DO NOTHING;

-- 4) Klijenti za Dinu (6)
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

-- 5) Klijenti za svakog od 20 predavača (po 5–8 dece)
DO $$
DECLARE
  r RECORD;
  imena TEXT[] := ARRAY['Luka','Maja','Filip','Ema','Vuk','Lena','Viktor','Sara','Ognjen','Mia','Nikola','Lara','Stefan','Una','Marko','Iva','Jovan','Tara','Nemanja','Hana'];
  prezimena TEXT[] := ARRAY['Popović','Jović','Savić','Kovačević','Stojanović','Milić','Babić','Grujić','Petrov','Đukić','Stanković','Vasić','Mladenović','Gajić','Ristić','Marković','Tasić','Pantić','Živković','Božić'];
  skole TEXT[] := ARRAY['OS Vuk Karadžić','OS Dušan Silni','OS Sveti Sava','OS Kralj Petar','OS Njegoš','OS Branko Radičević','OS Desanka Maksimović','OS Jovan Jovanović'];
  idx INT;
  j INT;
BEGIN
  FOR r IN (SELECT id FROM instructors WHERE email LIKE 'predavac%@test.com') LOOP
    FOR j IN 1..(5 + (random() * 4)::int) LOOP
      idx := 1 + (j * 7) % 20;
      INSERT INTO clients (instructor_id, ime, prezime, godiste, razred, skola, roditelj, kontakt_telefon, placeno_casova, login_email)
      VALUES (
        r.id,
        imena[idx],
        prezimena[1 + (j * 11) % 20],
        2009 + (j % 8),
        (5 + (j % 6))::TEXT,
        skole[1 + (j % 8)],
        'Roditelj ' || j,
        '06' || (1 + (j % 9))::TEXT || ' ' || (100 + j*111)::TEXT,
        (j * 2)::int,
        NULL
      );
    END LOOP;
  END LOOP;
END $$;

-- 6) Termini: PONEDELJAK–PETAK NAREDNE NEDELJE, za sve predavače (Dina + 20), slotovi 0–8
DO $$
DECLARE
  next_monday DATE;
  d DATE;
  day_off INT;
  s INT;
  r RECORD;
BEGIN
  -- Sledeći ponedeljak: ako je danas ponedeljak, +7; inače dani do sledećeg ponedeljka
  next_monday := CURRENT_DATE + CASE WHEN EXTRACT(ISODOW FROM CURRENT_DATE) = 1 THEN 7 ELSE (8 - EXTRACT(ISODOW FROM CURRENT_DATE)::int) END;

  FOR r IN (SELECT id FROM instructors) LOOP
    FOR day_off IN 0..4 LOOP
      d := next_monday + day_off;
      FOR s IN 0..8 LOOP
        INSERT INTO terms (instructor_id, date, slot_index) VALUES (r.id, d, s)
        ON CONFLICT (instructor_id, date, slot_index) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- 7) Predavanja: Dina – nekoliko za prvi dan naredne nedelje
DO $$
DECLARE
  next_monday DATE;
BEGIN
  next_monday := CURRENT_DATE + CASE WHEN EXTRACT(ISODOW FROM CURRENT_DATE) = 1 THEN 7 ELSE (8 - EXTRACT(ISODOW FROM CURRENT_DATE)::int) END;

  INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
  SELECT t.id, c.id, true, true, 'Rad na pismenom.'
  FROM terms t
  JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
  JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Neko' AND c.prezime = 'Dete'
  WHERE t.slot_index = 0 AND t.date = next_monday LIMIT 1;

  INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
  SELECT t.id, c.id, true, true, 'Matematika - jednačine.'
  FROM terms t
  JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
  JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Marko'
  WHERE t.slot_index = 1 AND t.date = next_monday LIMIT 1;

  INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
  SELECT t.id, c.id, true, false, 'Čitanje.'
  FROM terms t
  JOIN instructors i ON i.id = t.instructor_id AND i.email = 'dina.mateja@yahoo.com'
  JOIN clients c ON c.instructor_id = i.id AND c.ime = 'Jovana'
  WHERE t.slot_index = 2 AND t.date = next_monday LIMIT 1;
END $$;

-- 7b) Predavanja: za svakog predavača po nekoliko termina naredne nedelje (jedan klijent po terminu)
DO $$
DECLARE
  next_monday DATE;
  r RECORD;
  t_rec RECORD;
  c_id UUID;
  cnt INT;
BEGIN
  next_monday := CURRENT_DATE + CASE WHEN EXTRACT(ISODOW FROM CURRENT_DATE) = 1 THEN 7 ELSE (8 - EXTRACT(ISODOW FROM CURRENT_DATE)::int) END;

  FOR r IN (SELECT id FROM instructors) LOOP
    cnt := 0;
    FOR t_rec IN (
      SELECT t.id FROM terms t
      WHERE t.instructor_id = r.id
        AND t.date BETWEEN next_monday AND next_monday + 4
        AND t.slot_index <= 4
        AND NOT EXISTS (SELECT 1 FROM predavanja p WHERE p.term_id = t.id)
      ORDER BY t.date, t.slot_index
      LIMIT 12
    ) LOOP
      SELECT id INTO c_id FROM clients WHERE instructor_id = r.id ORDER BY random() LIMIT 1;
      IF c_id IS NOT NULL THEN
        INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar)
        VALUES (t_rec.id, c_id, (random() > 0.5), (random() > 0.5), 'Čas iz seeda.');
        cnt := cnt + 1;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 8) Poveži učenika NekoDete sa klijentom
UPDATE clients
SET user_id = (SELECT id FROM auth.users WHERE email = 'nekodete@gmail.com' LIMIT 1)
WHERE login_email = 'nekodete@gmail.com' AND user_id IS NULL;
