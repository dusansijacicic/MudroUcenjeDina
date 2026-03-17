-- Ispravka: korisnik mora da može da pročita SVOJ red u admin_users
-- da bi aplikacija znala da ga preusmeri na /admin (inače RLS blokira i izgleda kao da nije admin)
DROP POLICY IF EXISTS "Admin users readable by admins" ON admin_users;
CREATE POLICY "Users can read own admin row" ON admin_users
  FOR SELECT USING (user_id = auth.uid());
