-- Učionice + vezivanje učionice za termine + slotovi i dalje 0–12 ali se UI menja da krene od 9:00.

CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naziv TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "classrooms_select_all" ON classrooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "classrooms_admin_all" ON classrooms FOR ALL TO authenticated USING (
  auth.uid() IN (SELECT user_id FROM admin_users)
) WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

ALTER TABLE terms
  ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL;

-- Jedan termin po učionici u datom slotu (bilo koji predavač)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_terms_classroom_date_slot
  ON terms(classroom_id, date, slot_index)
  WHERE classroom_id IS NOT NULL;

COMMENT ON TABLE classrooms IS 'Učionice (sobe) u školi – nazivi i boje za kalendar.';
COMMENT ON COLUMN terms.classroom_id IS 'Učionica u kojoj se termin održava (po slotu u danu može biti najviše jedan termin u jednoj učionici).';

