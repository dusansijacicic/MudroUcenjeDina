-- Klijent (dete) može biti vezan za više predavača – many-to-many preko instructor_clients.
-- placeno_casova je sada po vezi predavač–klijent.

-- 1) Tabela veze predavač–klijent
CREATE TABLE instructor_clients (
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  placeno_casova INT NOT NULL DEFAULT 0,
  PRIMARY KEY (instructor_id, client_id)
);

CREATE INDEX idx_instructor_clients_instructor ON instructor_clients(instructor_id);
CREATE INDEX idx_instructor_clients_client ON instructor_clients(client_id);

-- 2) Migracija podataka: za svakog postojećeg klijenta jedna veza
INSERT INTO instructor_clients (instructor_id, client_id, placeno_casova)
SELECT instructor_id, id, placeno_casova FROM clients;

-- 3) Ukloni instructor_id iz clients (klijent postaje "globalan")
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_instructor_id_fkey;
ALTER TABLE clients DROP COLUMN IF EXISTS instructor_id;

-- 4) RLS za instructor_clients
ALTER TABLE instructor_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors own instructor_clients" ON instructor_clients
  FOR ALL USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins full access instructor_clients" ON instructor_clients
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Učenik (klijent) može da vidi svoje veze (zbir „plaćeno časova” kod svih predavača)
CREATE POLICY "Clients read own instructor_clients" ON instructor_clients
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

-- 5) Nova RLS za clients: predavač vidi/menja klijente koji su mu povezani preko instructor_clients
DROP POLICY IF EXISTS "Instructors own clients" ON clients;

CREATE POLICY "Instructors see linked clients" ON clients
  FOR SELECT USING (
    id IN (
      SELECT client_id FROM instructor_clients
      WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Instructors update linked clients" ON clients
  FOR UPDATE USING (
    id IN (
      SELECT client_id FROM instructor_clients
      WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

-- Predavač ili admin može da kreira nove klijente; vezu predavač–klijent dodaje u instructor_clients u aplikaciji
CREATE POLICY "Instructors or admin insert clients" ON clients
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT user_id FROM instructors)
    OR auth.uid() IN (SELECT user_id FROM admin_users)
  );

CREATE POLICY "Instructors insert instructor_clients" ON instructor_clients
  FOR INSERT WITH CHECK (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

CREATE POLICY "Instructors update instructor_clients" ON instructor_clients
  FOR UPDATE USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );
