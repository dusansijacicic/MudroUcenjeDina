-- Testiranja: otkazivanje i brisanje.
--  * Novi status 'otkazan' za dete sa testiranja (mod "Otkaži" na kalendaru, dugme "Otkaži" kod deteta,
--    "Otkaži termin" na terminu testiranja). Na kalendaru ostaje sivi zapis "otkazano" (otkazani_termini).
--  * datum_termina / slot_termina: datum i vreme testiranja zapamćeni na samom detetu, da se u Istoriji
--    testiranja vidi kad je bilo i kad dete više nije vezano za termin (otkazano, ili je termin obrisan –
--    potential_clients.term_id je ON DELETE SET NULL).

ALTER TABLE potential_clients DROP CONSTRAINT IF EXISTS potential_clients_status_check;
ALTER TABLE potential_clients ADD CONSTRAINT potential_clients_status_check
  CHECK (status IN ('zakazan', 'pojavio_se', 'nije_se_pojavio', 'prebacen_u_klijenta', 'otkazan'));

ALTER TABLE potential_clients ADD COLUMN IF NOT EXISTS datum_termina DATE;
ALTER TABLE potential_clients ADD COLUMN IF NOT EXISTS slot_termina SMALLINT;

-- Postojeća deca koja su još na terminu dobijaju njegov datum/vreme.
UPDATE potential_clients pc
SET datum_termina = t.date, slot_termina = t.slot_index
FROM terms t
WHERE t.id = pc.term_id AND pc.datum_termina IS NULL;
