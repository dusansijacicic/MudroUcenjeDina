-- ============================================================
-- Poveži Auth nalog sa ulogom (admin / predavač / učenik)
-- ============================================================
-- Zameni email ako treba. Pokreni onaj blok koji ti odgovara.
-- ============================================================

-- ADMIN (dusan.sijacic2@gmail.com)
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'dusan.sijacic2@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- PREDAVAČ (dina.mateja@yahoo.com)
INSERT INTO instructors (user_id, ime, prezime, email, color)
SELECT id, 'Dina', 'Mateja', email, '#0d9488'
FROM auth.users WHERE email = 'dina.mateja@yahoo.com'
ON CONFLICT (user_id) DO NOTHING;

-- UČENIK – nekodete@gmail.com (poveži klijenta „Neko Dete” sa Auth nalogom)
UPDATE clients
SET user_id = (SELECT id FROM auth.users WHERE email = 'nekodete@gmail.com' LIMIT 1)
WHERE login_email = 'nekodete@gmail.com';
