-- Učenik može da se uloguje: dodaj user_id i login_email klijentu
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS login_email TEXT UNIQUE;

-- Povezivanje učenika: predavač unosi login_email kod klijenta; učenik se registruje tim emailom,
-- pa poziva ovu funkciju da se poveže sa svojim profilom.
CREATE OR REPLACE FUNCTION public.link_client_to_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  UPDATE public.clients
  SET user_id = auth.uid()
  WHERE login_email = user_email AND (user_id IS NULL OR user_id = auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.link_client_to_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_client_to_user() TO service_role;

-- Privremena tabela novih termina (jedan red = jedan slot na dan, bez client_id)
CREATE TABLE terms_new (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  slot_index SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index <= 12),
  UNIQUE(instructor_id, date, slot_index)
);

-- Predavanja: više po jednom terminu (term = slot, predavanje = jedan čas sa jednim klijentom)
CREATE TABLE predavanja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES terms_new(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  odrzano BOOLEAN NOT NULL DEFAULT false,
  placeno BOOLEAN NOT NULL DEFAULT false,
  komentar TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migracija: jedinstveni slotovi u terms_new
INSERT INTO terms_new (instructor_id, date, slot_index)
SELECT DISTINCT instructor_id, date, slot_index FROM terms;

-- Migracija: svaki stari "term" postaje jedno predavanje (term_id iz terms_new)
INSERT INTO predavanja (term_id, client_id, odrzano, placeno, komentar, created_at)
SELECT t.id, o.client_id, o.odrzano, o.placeno, o.komentar, o.created_at
FROM terms o
JOIN terms_new t ON t.instructor_id = o.instructor_id AND t.date = o.date AND t.slot_index = o.slot_index;

-- Ukloni stare politike i tabelu terms
DROP POLICY IF EXISTS "Instructors own terms" ON terms;
DROP TABLE terms;

-- Preimenuj terms_new u terms (FK u predavanja ostaje ispravan)
ALTER TABLE terms_new RENAME TO terms;

-- RLS za predavanja
ALTER TABLE predavanja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors own predavanja" ON predavanja
  FOR ALL USING (
    term_id IN (
      SELECT id FROM terms WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Clients read own predavanja" ON predavanja
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

-- Učenik može da čita samo svoj profil
DROP POLICY IF EXISTS "Instructors own clients" ON clients;
CREATE POLICY "Instructors own clients" ON clients
  FOR ALL USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );
CREATE POLICY "Clients read own row" ON clients
  FOR SELECT USING (user_id = auth.uid());

-- RLS za terms (predavač vidi samo svoje)
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Instructors own terms" ON terms
  FOR ALL USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- Indeksi
CREATE INDEX idx_predavanja_term ON predavanja(term_id);
CREATE INDEX idx_predavanja_client ON predavanja(client_id);
CREATE INDEX idx_terms_instructor_date ON terms(instructor_id, date);
