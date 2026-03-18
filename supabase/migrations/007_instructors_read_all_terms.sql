-- Predavači mogu da čitaju sve termine i predavanja (da vide ko još drži čas u istom terminu).
-- INSERT/UPDATE/DELETE i dalje samo na svojim (postojeće politike).

CREATE POLICY "Instructors can read all terms" ON terms
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM instructors)
  );

CREATE POLICY "Instructors can read all predavanja" ON predavanja
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM instructors)
  );
