-- Kategorija termina (individualni = jedno dete; grupni = više dece u istom terminu).
-- Napomene na terminu i klijentu.
ALTER TABLE terms ADD COLUMN IF NOT EXISTS kategorija TEXT NOT NULL DEFAULT 'individualni'
  CHECK (kategorija IN ('individualni', 'grupni'));
ALTER TABLE terms ADD COLUMN IF NOT EXISTS napomena TEXT;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS napomena TEXT;

COMMENT ON COLUMN terms.kategorija IS 'individualni: max jedna radionica (jedno dete); grupni: više radionica do limita iz podešavanja.';
COMMENT ON COLUMN terms.napomena IS 'Interna napomena za ovaj termin.';
COMMENT ON COLUMN clients.napomena IS 'Interna napomena o klijentu.';
