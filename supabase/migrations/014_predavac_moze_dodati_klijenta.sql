-- Vraća mogućnost da predavač dodaje i menja klijente (povratak pre 013).
DROP POLICY IF EXISTS "Admins insert clients" ON clients;
CREATE POLICY "Instructors or admin insert clients" ON clients FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM instructors) OR auth.uid() IN (SELECT user_id FROM admin_users)
);

DROP POLICY IF EXISTS "Instructors own instructor_clients" ON instructor_clients;
CREATE POLICY "Instructors own instructor_clients" ON instructor_clients FOR ALL USING (
  instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
);
CREATE POLICY "Instructors insert instructor_clients" ON instructor_clients FOR INSERT WITH CHECK (
  instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
);
