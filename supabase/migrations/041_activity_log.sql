-- Dnevnik aktivnosti: beleži ko je šta uradio (admin ili predavač) za sve značajnije izmene u
-- aplikaciji (zakazivanje/izmena/brisanje termina, klijenti, uplate, itd). Upisuje se isključivo
-- preko service-role admin klijenta na serveru (src/lib/audit.ts) – RLS ovde samo ograničava ČITANJE.
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Ostavlja se NULL (ne briše se ceo red) ako je korisnik kasnije obrisan – actor_email/actor_name
  -- ostaju kao trag ko je akciju izvršio.
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_name TEXT,
  actor_role TEXT NOT NULL, -- 'admin' | 'instruktor' | 'sistem'
  action TEXT NOT NULL,     -- kratka mašinska šifra, npr. 'term.create', 'predavanje.delete'
  entity_type TEXT,         -- 'term' | 'predavanje' | 'client' | 'uplata' | ...
  entity_id TEXT,
  description TEXT NOT NULL, -- čitljiv opis na srpskom, prikazuje se u dnevniku
  metadata JSONB              -- dodatni strukturirani detalji (stare/nove vrednosti i sl.)
);

CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor_id_idx ON activity_log (actor_id);
CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS activity_log_action_idx ON activity_log (action);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Samo admini mogu da čitaju dnevnik (upis ide isključivo preko service-role klijenta, mimo RLS-a).
CREATE POLICY "Admins can read activity log" ON activity_log
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );
