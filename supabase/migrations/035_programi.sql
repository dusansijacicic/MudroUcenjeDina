-- Programi (npr. Čitanje, Matematika, Logoped, Učenje, Defektološki) – nadkategorija za Vrste termina.
-- Jedan program sadrži više vrsta termina; jedna vrsta termina pripada tačno jednom programu.
-- Odvojeno od term_categories (Individualni/Grupni = TIP TERMINA, ostaje nepromenjeno).

CREATE TABLE IF NOT EXISTS programi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naziv TEXT NOT NULL,
  opis TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE programi IS 'Program (npr. Čitanje, Matematika, Logoped, Učenje, Defektološki) – jedan program sadrži više vrsta termina.';

INSERT INTO programi (id, naziv) VALUES
  ('a1b2c3d4-1111-4a2a-9c3d-000000000001', 'Čitanje'),
  ('a1b2c3d4-1111-4a2a-9c3d-000000000002', 'Matematika'),
  ('a1b2c3d4-1111-4a2a-9c3d-000000000003', 'Logoped'),
  ('a1b2c3d4-1111-4a2a-9c3d-000000000004', 'Učenje'),
  ('a1b2c3d4-1111-4a2a-9c3d-000000000005', 'Defektološki')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE programi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "programi_select_authenticated" ON programi FOR SELECT TO authenticated USING (true);
CREATE POLICY "programi_admin_all" ON programi FOR ALL TO authenticated USING (
  auth.uid() IN (SELECT user_id FROM admin_users)
) WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

-- Vrsta termina pripada tačno jednom programu. Nullable zbog postojećih redova (admin ih dopunjava kroz izmenu);
-- forma za novu/izmenjenu vrstu termina zahteva izbor programa.
ALTER TABLE term_types ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programi(id) ON DELETE SET NULL;

-- Nezavisno od Vrsta termina koje dete pohađa (client_term_type_status): koje Programe dete pohađa + status.
CREATE TABLE IF NOT EXISTS client_programi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programi(id) ON DELETE CASCADE,
  zavrseno BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, program_id)
);

COMMENT ON TABLE client_programi IS 'Koje programe dete pohađa (nezavisno od konkretnih vrsta termina) + status završeno/u toku.';

ALTER TABLE client_programi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access client_programi" ON client_programi
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

CREATE POLICY "Instructors manage own clients programi" ON client_programi
  FOR ALL USING (
    client_id IN (
      SELECT client_id FROM instructor_clients
      WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );
