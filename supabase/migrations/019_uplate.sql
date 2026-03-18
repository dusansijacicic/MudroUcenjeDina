-- Evidencija uplata: ko je primio, kada, koliko, za koga, koja vrsta časova
CREATE TABLE uplate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  iznos DECIMAL(10,2),
  term_type_id UUID REFERENCES term_types(id) ON DELETE SET NULL,
  broj_casova INT NOT NULL DEFAULT 1 CHECK (broj_casova >= 0),
  napomena TEXT
);

CREATE INDEX idx_uplate_created_at ON uplate(created_at DESC);
CREATE INDEX idx_uplate_instructor ON uplate(instructor_id);
CREATE INDEX idx_uplate_client ON uplate(client_id);

COMMENT ON TABLE uplate IS 'Evidencija uplata: datum/vreme, ko je primio novac (predavač), klijent, iznos, vrsta časova, broj časova.';

ALTER TABLE uplate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uplate_select_admin" ON uplate FOR SELECT TO authenticated
  USING ((SELECT 1 FROM admin_users WHERE user_id = auth.uid()) IS NOT NULL);

CREATE POLICY "uplate_select_own_instructor" ON uplate FOR SELECT TO authenticated
  USING (instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "uplate_insert_admin" ON uplate FOR INSERT TO authenticated
  WITH CHECK ((SELECT 1 FROM admin_users WHERE user_id = auth.uid()) IS NOT NULL);

CREATE POLICY "uplate_insert_own_instructor" ON uplate FOR INSERT TO authenticated
  WITH CHECK (instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "uplate_all_admin" ON uplate FOR ALL TO authenticated
  USING ((SELECT 1 FROM admin_users WHERE user_id = auth.uid()) IS NOT NULL);
