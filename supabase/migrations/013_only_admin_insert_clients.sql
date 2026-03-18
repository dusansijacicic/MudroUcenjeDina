-- Samo super admin može da kreira nove klijente i veze predavač–klijent.
-- Predavači mogu samo da vide i ažuriraju (npr. plaćeno časova), ne da dodaju.

DROP POLICY IF EXISTS "Instructors or admin insert clients" ON clients;
CREATE POLICY "Admins insert clients" ON clients FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM admin_users)
);

DROP POLICY IF EXISTS "Instructors own instructor_clients" ON instructor_clients;
CREATE POLICY "Instructors own instructor_clients" ON instructor_clients FOR SELECT USING (
  instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
);
DROP POLICY IF EXISTS "Instructors insert instructor_clients" ON instructor_clients;
