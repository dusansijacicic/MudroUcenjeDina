-- Podešavanja aplikacije (superadmin može da menja)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Podrazumevano: maksimalan broj časova u jednom terminu
INSERT INTO app_settings (key, value) VALUES ('max_casova_po_terminu', '4')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Svi ulogovani mogu da čitaju (potrebno za prikaz limita)
CREATE POLICY "Authenticated read app_settings" ON app_settings
  FOR SELECT TO authenticated USING (true);

-- Samo superadmin može da menja
CREATE POLICY "Admin update app_settings" ON app_settings
  FOR ALL TO authenticated USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  )
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );
