-- Cena po času za vrstu termina (admin unosi u Vrste termina)
ALTER TABLE term_types
  ADD COLUMN IF NOT EXISTS cena_po_casu DECIMAL(10,2);

-- Popust na nivou klijenta (npr. 10 = 10%); super admin dodeljuje
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS popust_percent DECIMAL(5,2) DEFAULT 0 CHECK (popust_percent >= 0 AND popust_percent <= 100);

-- Popust za pojedinačnu uplatu (npr. 10 = 10% na ovu uplatu)
ALTER TABLE uplate
  ADD COLUMN IF NOT EXISTS popust_percent DECIMAL(5,2) CHECK (popust_percent IS NULL OR (popust_percent >= 0 AND popust_percent <= 100));

COMMENT ON COLUMN term_types.cena_po_casu IS 'Cena za 1 čas ove vrste (RSD).';
COMMENT ON COLUMN clients.popust_percent IS 'Popust u % za ovog klijenta (npr. 10 = 10%).';
COMMENT ON COLUMN uplate.popust_percent IS 'Popust u % primenjen na ovu uplatu.';
