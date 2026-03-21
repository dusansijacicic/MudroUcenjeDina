-- Kategorije termina kao zasebna tabela (admin CRUD). Zamena za terms.kategorija TEXT.

CREATE TABLE IF NOT EXISTS term_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naziv TEXT NOT NULL,
  opis TEXT,
  -- true = u terminu najviše jedna radionica (jedno dete); false = do max_casova_po_terminu
  jedan_klijent_po_terminu BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE term_categories IS 'Kategorija termina (npr. Individualni / Grupni) – menja samo admin.';
COMMENT ON COLUMN term_categories.jedan_klijent_po_terminu IS 'true: max 1 dete u terminu; false: grupni, više radionica do podešavanja.';

INSERT INTO term_categories (id, naziv, opis, jedan_klijent_po_terminu) VALUES
  ('e8b4c5d0-1111-4a2a-9c3d-000000000001', 'Individualni', 'Samo jedno dete u terminu.', true),
  ('e8b4c5d0-1111-4a2a-9c3d-000000000002', 'Grupni', 'Više dece u istom terminu, do limita iz podešavanja.', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE terms ADD COLUMN IF NOT EXISTS term_category_id UUID REFERENCES term_categories(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'terms' AND column_name = 'kategorija'
  ) THEN
    UPDATE terms SET term_category_id = 'e8b4c5d0-1111-4a2a-9c3d-000000000002'::uuid
    WHERE term_category_id IS NULL AND kategorija = 'grupni';
    UPDATE terms SET term_category_id = 'e8b4c5d0-1111-4a2a-9c3d-000000000001'::uuid
    WHERE term_category_id IS NULL;
  ELSE
    UPDATE terms SET term_category_id = 'e8b4c5d0-1111-4a2a-9c3d-000000000001'::uuid
    WHERE term_category_id IS NULL;
  END IF;
END $$;

ALTER TABLE terms ALTER COLUMN term_category_id SET NOT NULL;

ALTER TABLE terms DROP CONSTRAINT IF EXISTS terms_kategorija_check;
ALTER TABLE terms DROP COLUMN IF EXISTS kategorija;

ALTER TABLE term_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "term_categories_select_authenticated" ON term_categories;
DROP POLICY IF EXISTS "term_categories_admin_all" ON term_categories;

CREATE POLICY "term_categories_select_authenticated" ON term_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "term_categories_admin_all" ON term_categories FOR ALL TO authenticated USING (
  auth.uid() IN (SELECT user_id FROM admin_users)
) WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));
