-- Koje programe (vrste termina) dete pohađa i da li je taj program završen.
-- Odvojeno od clients.accessible_term_type_ids (to je pristup/dozvola zakazivanja, ne evidencija pohađanja).

CREATE TABLE IF NOT EXISTS client_term_type_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  term_type_id UUID NOT NULL REFERENCES term_types(id) ON DELETE CASCADE,
  zavrseno BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, term_type_id)
);

COMMENT ON TABLE client_term_type_status IS 'Programi (vrste termina) koje dete pohađa + status završeno/u toku.';

ALTER TABLE client_term_type_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access client_term_type_status" ON client_term_type_status
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

CREATE POLICY "Instructors manage own clients term type status" ON client_term_type_status
  FOR ALL USING (
    client_id IN (
      SELECT client_id FROM instructor_clients
      WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );
