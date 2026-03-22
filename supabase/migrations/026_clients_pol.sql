-- Pol učenika (opciono)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pol TEXT;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_pol_check;
ALTER TABLE clients ADD CONSTRAINT clients_pol_check
  CHECK (pol IS NULL OR pol IN ('muski', 'zenski'));

COMMENT ON COLUMN clients.pol IS 'Pol: muski / zenski; NULL ako nije uneto.';
