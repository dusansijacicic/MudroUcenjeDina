-- "Swap" mod na admin kalendaru: zamena Termina (datum/slot), Instruktora, Učionice i/ili Klijenta
-- (cele radionice) između dva postojeća termina, u bilo kojoj kombinaciji.
--
-- terms(instructor_id, date, slot_index) je UNIQUE i sve tri kolone su NOT NULL, pa se (za razliku
-- od classroom_id koji je nullable) ne može privremeno "nulovati" da bi se izbegao tranzitorni sudar
-- kod zamene datuma/vremena između dva termina ISTOG instruktora. Zato se taj constraint pravi
-- DEFERRABLE INITIALLY IMMEDIATE (ponašanje svuda drugde ostaje nepromenjeno – samo swap_terms()
-- eksplicitno odlaže proveru unutar svoje transakcije).
--
-- Tabela je originalno kreirana kao terms_new (002_predavanja_i_ucenik.sql) pa preimenovana u terms;
-- Postgres NE preimenuje constraint pri RENAME TABLE, pa se pravo ime u bazi ne sme pretpostaviti –
-- pronalazi se dinamički po skupu kolona.
DO $$
DECLARE
  v_cname text;
BEGIN
  SELECT c.conname INTO v_cname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'terms'
    AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 3
    AND (
      SELECT array_agg(a.attname ORDER BY a.attname)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ) = ARRAY['date', 'instructor_id', 'slot_index']::name[];

  IF v_cname IS NULL THEN
    RAISE EXCEPTION 'Nije pronađeno UNIQUE ograničenje terms(instructor_id, date, slot_index).';
  END IF;

  -- Postgres dozvoljava ALTER TABLE ... ALTER CONSTRAINT ... DEFERRABLE samo za FOREIGN KEY
  -- ograničenja, ne i za UNIQUE ("is not a foreign key constraint") – mora se ukloniti i ponovo
  -- dodati pod istim imenom, ovog puta sa DEFERRABLE INITIALLY IMMEDIATE.
  EXECUTE format('ALTER TABLE terms DROP CONSTRAINT %I', v_cname);
  EXECUTE format(
    'ALTER TABLE terms ADD CONSTRAINT %I UNIQUE (instructor_id, date, slot_index) DEFERRABLE INITIALLY IMMEDIATE',
    v_cname
  );
END $$;

CREATE OR REPLACE FUNCTION public.swap_terms(
  p_term_a UUID,
  p_term_b UUID,
  p_swap_termin BOOLEAN,
  p_swap_instruktor BOOLEAN,
  p_swap_ucionica BOOLEAN,
  p_swap_klijent BOOLEAN
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a terms%ROWTYPE;
  b terms%ROWTYPE;
  new_a_date DATE; new_a_slot SMALLINT; new_a_instr UUID; new_a_room UUID;
  new_b_date DATE; new_b_slot SMALLINT; new_b_instr UUID; new_b_room UUID;
  cnt_a INT; cnt_b INT;
  pred_a_id UUID; pred_b_id UUID;
BEGIN
  IF p_term_a = p_term_b THEN
    RAISE EXCEPTION 'Izaberite dva različita termina.';
  END IF;

  SELECT * INTO a FROM terms WHERE id = p_term_a FOR UPDATE;
  SELECT * INTO b FROM terms WHERE id = p_term_b FOR UPDATE;
  IF a.id IS NULL OR b.id IS NULL THEN
    RAISE EXCEPTION 'Termin nije pronađen.';
  END IF;

  -- Automatski "blokirajući" slotovi dužeg časa (dvočas) nisu pravi termini za zamenu – filler.
  -- Napomena mora ostati usklađena sa AUTO_SPILLOVER_NAPOMENA iz src/lib/constants.ts.
  IF (a.nastavak_of_term_id IS NOT NULL AND a.napomena = 'Automatski zauzeto (nastavak dužeg časa)'
      AND NOT EXISTS (SELECT 1 FROM predavanja WHERE term_id = a.id))
     OR (b.nastavak_of_term_id IS NOT NULL AND b.napomena = 'Automatski zauzeto (nastavak dužeg časa)'
      AND NOT EXISTS (SELECT 1 FROM predavanja WHERE term_id = b.id)) THEN
    RAISE EXCEPTION 'Automatski blok (nastavak dužeg časa) nije moguće menjati – izaberite pravi termin.';
  END IF;

  new_a_date  := CASE WHEN p_swap_termin THEN b.date ELSE a.date END;
  new_a_slot  := CASE WHEN p_swap_termin THEN b.slot_index ELSE a.slot_index END;
  new_a_instr := CASE WHEN p_swap_instruktor THEN b.instructor_id ELSE a.instructor_id END;
  new_a_room  := CASE WHEN p_swap_ucionica THEN b.classroom_id ELSE a.classroom_id END;

  new_b_date  := CASE WHEN p_swap_termin THEN a.date ELSE b.date END;
  new_b_slot  := CASE WHEN p_swap_termin THEN a.slot_index ELSE b.slot_index END;
  new_b_instr := CASE WHEN p_swap_instruktor THEN a.instructor_id ELSE b.instructor_id END;
  new_b_room  := CASE WHEN p_swap_ucionica THEN a.classroom_id ELSE b.classroom_id END;

  IF new_a_instr = new_b_instr AND new_a_date = new_b_date AND new_a_slot = new_b_slot THEN
    RAISE EXCEPTION 'Ne mogu oba termina da imaju istog instruktora u istom terminu.';
  END IF;
  IF new_a_room IS NOT NULL AND new_a_room = new_b_room AND new_a_date = new_b_date AND new_a_slot = new_b_slot THEN
    RAISE EXCEPTION 'Ne mogu oba termina da imaju istu učionicu u istom terminu.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM terms WHERE id NOT IN (p_term_a, p_term_b)
      AND instructor_id = new_a_instr AND date = new_a_date AND slot_index = new_a_slot
  ) THEN
    RAISE EXCEPTION 'Instruktor je već zauzet u tom terminu.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM terms WHERE id NOT IN (p_term_a, p_term_b)
      AND instructor_id = new_b_instr AND date = new_b_date AND slot_index = new_b_slot
  ) THEN
    RAISE EXCEPTION 'Instruktor je već zauzet u tom terminu.';
  END IF;
  IF new_a_room IS NOT NULL AND EXISTS (
    SELECT 1 FROM terms WHERE id NOT IN (p_term_a, p_term_b)
      AND classroom_id = new_a_room AND date = new_a_date AND slot_index = new_a_slot
  ) THEN
    RAISE EXCEPTION 'Učionica je već zauzeta u tom terminu.';
  END IF;
  IF new_b_room IS NOT NULL AND EXISTS (
    SELECT 1 FROM terms WHERE id NOT IN (p_term_a, p_term_b)
      AND classroom_id = new_b_room AND date = new_b_date AND slot_index = new_b_slot
  ) THEN
    RAISE EXCEPTION 'Učionica je već zauzeta u tom terminu.';
  END IF;

  IF p_swap_klijent THEN
    SELECT count(*) INTO cnt_a FROM predavanja WHERE term_id = p_term_a;
    SELECT count(*) INTO cnt_b FROM predavanja WHERE term_id = p_term_b;
    IF cnt_a <> 1 OR cnt_b <> 1 THEN
      RAISE EXCEPTION 'Zamena klijenta je moguća samo kada oba termina imaju tačno jednu radionicu (individualni čas).';
    END IF;
    SELECT id INTO pred_a_id FROM predavanja WHERE term_id = p_term_a;
    SELECT id INTO pred_b_id FROM predavanja WHERE term_id = p_term_b;
  END IF;

  SET CONSTRAINTS ALL DEFERRED;

  -- Učionica je delimično-unique (samo kad nije NULL) – prvo se oslobađa na oba reda da izmena
  -- datuma/slota/instruktora ne bi mogla tranzitorno da sudari (classroom_id, date, slot_index)
  -- sa trećim terminom (isti trik kao updateTermClassroomAsAdmin).
  UPDATE terms SET classroom_id = NULL WHERE id IN (p_term_a, p_term_b);

  UPDATE terms SET date = new_a_date, slot_index = new_a_slot, instructor_id = new_a_instr WHERE id = p_term_a;
  UPDATE terms SET date = new_b_date, slot_index = new_b_slot, instructor_id = new_b_instr WHERE id = p_term_b;

  UPDATE terms SET classroom_id = new_a_room WHERE id = p_term_a;
  UPDATE terms SET classroom_id = new_b_room WHERE id = p_term_b;

  IF p_swap_klijent THEN
    UPDATE predavanja SET term_id = p_term_b WHERE id = pred_a_id;
    UPDATE predavanja SET term_id = p_term_a WHERE id = pred_b_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.swap_terms(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swap_terms(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO service_role;
