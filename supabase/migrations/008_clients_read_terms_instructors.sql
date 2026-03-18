-- Učenik (klijent) može da vidi termine i predavače za svoja predavanja (ko je držao termin, šta je rađeno).

CREATE POLICY "Clients read terms for own predavanja" ON terms
  FOR SELECT USING (
    id IN (
      SELECT term_id FROM predavanja
      WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Clients read instructors for own predavanja" ON instructors
  FOR SELECT USING (
    id IN (
      SELECT instructor_id FROM terms
      WHERE id IN (
        SELECT term_id FROM predavanja
        WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
      )
    )
  );
