-- Boja za predavača (prikaz u kalendaru)
ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#EAB308';
