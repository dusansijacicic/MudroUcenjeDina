-- Predavači (povezani sa auth.users)
CREATE TABLE instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ime TEXT NOT NULL,
  prezime TEXT NOT NULL,
  email TEXT NOT NULL,
  telefon TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Klijenti (učenici)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  ime TEXT NOT NULL,
  prezime TEXT NOT NULL,
  godiste INT,
  razred TEXT,
  skola TEXT,
  roditelj TEXT,
  kontakt_telefon TEXT,
  placeno_casova INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Termini (časovi)
CREATE TABLE terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  slot_index SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index <= 12),
  odrzano BOOLEAN NOT NULL DEFAULT false,
  placeno BOOLEAN NOT NULL DEFAULT false,
  komentar TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(instructor_id, date, slot_index)
);

-- RLS
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;

-- Predavač vidi samo sebe
CREATE POLICY "Instructors own row" ON instructors
  FOR ALL USING (auth.uid() = user_id);

-- Predavač vidi samo svoje klijente
CREATE POLICY "Instructors own clients" ON clients
  FOR ALL USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- Predavač vidi samo svoje termine
CREATE POLICY "Instructors own terms" ON terms
  FOR ALL USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- Dozvoli insert u instructors za novog usera (nakon sign up)
CREATE POLICY "Users can insert own instructor row" ON instructors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Indeksi
CREATE INDEX idx_clients_instructor ON clients(instructor_id);
CREATE INDEX idx_terms_instructor_date ON terms(instructor_id, date);
CREATE INDEX idx_terms_client ON terms(client_id);
