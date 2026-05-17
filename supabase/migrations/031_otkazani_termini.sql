-- Otkazani termini: čuvaju se kao istorija kad se klijent ukloni iz termina.
-- Instruktor i učionica se oslobađaju (termin se briše), ali ostaje sivi zapis u kalendaru.

CREATE TABLE IF NOT EXISTS otkazani_termini (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_ime TEXT NOT NULL DEFAULT '',
  client_prezime TEXT,
  instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
  instructor_ime TEXT,
  instructor_prezime TEXT,
  classroom_naziv TEXT,
  term_date DATE NOT NULL,
  slot_index SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index <= 15),
  term_type_naziv TEXT,
  placeno BOOLEAN NOT NULL DEFAULT false,
  napomena TEXT,
  otkazano_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE otkazani_termini ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to otkazani_termini" ON otkazani_termini
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Instructor read own otkazani_termini" ON otkazani_termini
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM instructors i
      WHERE i.user_id = auth.uid() AND i.id = otkazani_termini.instructor_id
    )
  );
