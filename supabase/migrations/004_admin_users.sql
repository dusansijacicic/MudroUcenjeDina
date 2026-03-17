-- Super admin: korisnici u ovoj tabeli mogu sve da menjaju
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Samo admini mogu da vide listu admina
CREATE POLICY "Admin users readable by admins" ON admin_users
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Prvog admina dodaješ ručno u SQL Editoru (nakon što se taj user registruje):
-- INSERT INTO admin_users (user_id) SELECT id FROM auth.users WHERE email = 'tvoj@email.com';

-- Admin može sve na instructors
CREATE POLICY "Admins full access instructors" ON instructors
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Admin može sve na clients
CREATE POLICY "Admins full access clients" ON clients
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Admin može sve na terms
CREATE POLICY "Admins full access terms" ON terms
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Admin može sve na predavanja
CREATE POLICY "Admins full access predavanja" ON predavanja
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );
