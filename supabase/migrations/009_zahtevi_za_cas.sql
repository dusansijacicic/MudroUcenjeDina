-- Zahtevi za čas: klijent zatraži termin, predavač potvrdi ili promeni.

CREATE TABLE zahtevi_za_cas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
  requested_date DATE NOT NULL,
  requested_slot_index SMALLINT NOT NULL CHECK (requested_slot_index >= 0 AND requested_slot_index <= 12),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'changed', 'rejected')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES instructors(id) ON DELETE SET NULL,
  created_term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
  created_predavanje_id UUID REFERENCES predavanja(id) ON DELETE SET NULL,
  note_from_instructor TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_zahtevi_client ON zahtevi_za_cas(client_id);
CREATE INDEX idx_zahtevi_instructor ON zahtevi_za_cas(instructor_id);
CREATE INDEX idx_zahtevi_status ON zahtevi_za_cas(status);

ALTER TABLE zahtevi_za_cas ENABLE ROW LEVEL SECURITY;

-- Klijent vidi samo svoje zahteve
CREATE POLICY "Clients read own zahtevi" ON zahtevi_za_cas
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

CREATE POLICY "Clients insert own zahtevi" ON zahtevi_za_cas
  FOR INSERT WITH CHECK (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

-- Predavač vidi zahteve gde je on izabran ili gde je "bilo ko" (instructor_id null) a on ima tog klijenta
CREATE POLICY "Instructors read zahtevi" ON zahtevi_za_cas
  FOR SELECT USING (
    instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1)
    OR (
      instructor_id IS NULL
      AND client_id IN (
        SELECT client_id FROM instructor_clients
        WHERE instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1)
      )
    )
  );

CREATE POLICY "Instructors update zahtevi" ON zahtevi_za_cas
  FOR UPDATE USING (
    instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1)
    OR (
      instructor_id IS NULL
      AND client_id IN (
        SELECT client_id FROM instructor_clients
        WHERE instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1)
      )
    )
  );

-- Admin vidi sve
CREATE POLICY "Admins full access zahtevi" ON zahtevi_za_cas
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Klijent može da čita predavače sa kojima je povezan (za izbor "kod kog da zatraži čas")
CREATE POLICY "Clients read linked instructors" ON instructors
  FOR SELECT USING (
    id IN (
      SELECT instructor_id FROM instructor_clients
      WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    )
  );
