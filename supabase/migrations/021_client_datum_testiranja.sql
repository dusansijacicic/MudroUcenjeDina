-- Datum testiranja / upisa – opciono polje na klijentu; lista klijenata sortira se po ovom datumu (noviji prvi).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS datum_testiranja DATE;

COMMENT ON COLUMN clients.datum_testiranja IS 'Datum testiranja ili upisa; za sortiranje liste klijenata.';
