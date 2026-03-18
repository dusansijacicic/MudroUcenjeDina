-- Vrste termina (naziv + opis), admin ih dodaje
CREATE TABLE term_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naziv TEXT NOT NULL,
  opis TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Opciono po predavanju
ALTER TABLE predavanja
  ADD COLUMN IF NOT EXISTS term_type_id UUID REFERENCES term_types(id) ON DELETE SET NULL;

COMMENT ON TABLE term_types IS 'Vrste termina (npr. individualni, grupa) – admin dodaje.';
COMMENT ON COLUMN predavanja.term_type_id IS 'Opciona vrsta termina za ovo predavanje.';

ALTER TABLE term_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "term_types_select_authenticated" ON term_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "term_types_admin_all" ON term_types FOR ALL TO authenticated USING (
  auth.uid() IN (SELECT user_id FROM admin_users)
) WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));
