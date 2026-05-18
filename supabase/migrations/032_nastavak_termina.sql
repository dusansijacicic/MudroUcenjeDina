-- NASTAVAK: novi tip termina koji je nastavak prethodnog.
-- Ne računa se u održane termine za naplatu.

ALTER TABLE term_categories ADD COLUMN IF NOT EXISTS is_nastavak BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS nastavak_of_term_id UUID REFERENCES terms(id) ON DELETE SET NULL;

-- Seed: NASTAVAK kategorija (fiksni UUID po konvenciji projekta)
INSERT INTO term_categories (id, naziv, jedan_klijent_po_terminu, is_testing, is_nastavak)
SELECT 'e8b4c5d0-1111-4a2a-9c3d-000000000004', 'NASTAVAK', false, false, true
WHERE NOT EXISTS (SELECT 1 FROM term_categories WHERE naziv = 'NASTAVAK');
