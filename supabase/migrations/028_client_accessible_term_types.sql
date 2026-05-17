-- Vrste časova kojima klijent ima pristup (prazno = bez ograničenja, sve vrste su dostupne)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS accessible_term_type_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN clients.accessible_term_type_ids IS
  'UUID-ovi vrsta termina kojima učenik ima pristup. Ako je prazan niz, nema ograničenja.';
