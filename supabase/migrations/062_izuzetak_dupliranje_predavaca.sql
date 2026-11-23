-- Izuzetak „dupliranje predavača“: termin označen sa dozvoli_preklapanje sme da postoji u istom bloku
-- kao drugi čas istog predavača (npr. čas od 55 min u 14:00 – njegov nastavak u 14:45 – i nov čas u
-- 14:45 sa drugim detetom). Bira se čekboksom pri dodavanju ili izmeni termina.
--
-- Pravila „jedan predavač = jedan termin u bloku“ i „jedna učionica = jedan termin u bloku“ i dalje važe
-- za sve ostale termine; samo termini-izuzeci (i nastavci njihovih dužih časova) se ne broje.
-- Predavač je i dalje odloživ (DEFERRABLE) jer ga Swap (swap_terms) privremeno krši unutar transakcije.

ALTER TABLE terms ADD COLUMN IF NOT EXISTS dozvoli_preklapanje BOOLEAN NOT NULL DEFAULT false;

-- Staro UNIQUE(instructor_id, date, slot_index) – ime se traži po kolonama (tabela je nekad preimenovana).
DO $$
DECLARE
  v_cname text;
BEGIN
  FOR v_cname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'terms'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['date', 'instructor_id', 'slot_index']::name[]
  LOOP
    EXECUTE format('ALTER TABLE terms DROP CONSTRAINT %I', v_cname);
  END LOOP;
END $$;

ALTER TABLE terms DROP CONSTRAINT IF EXISTS terms_predavac_jedan_po_bloku;
ALTER TABLE terms
  ADD CONSTRAINT terms_predavac_jedan_po_bloku
  EXCLUDE USING btree (instructor_id WITH =, date WITH =, slot_index WITH =)
  WHERE (NOT dozvoli_preklapanje)
  DEFERRABLE INITIALLY IMMEDIATE;

-- Učionica: isto, bez termina-izuzetaka.
DROP INDEX IF EXISTS uniq_terms_classroom_date_slot;
CREATE UNIQUE INDEX uniq_terms_classroom_date_slot
  ON terms (classroom_id, date, slot_index)
  WHERE classroom_id IS NOT NULL AND NOT dozvoli_preklapanje;

-- API odmah vidi novu kolonu.
NOTIFY pgrst, 'reload schema';
