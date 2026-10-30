-- Blokade po instruktoru: blokada može važiti za SVE (instructor_id = NULL – kao do sada, ceo slot je
-- zatvoren) ili samo za JEDNOG instruktora (on u tom slotu ne može dobiti čas; ostali mogu).
-- Pored blokade za konkretan datum postoji i STALNA NEDELJNA blokada instruktora (npr. "utorkom od
-- 9:00 do 10:30 ne radim") – važi svake nedelje dok se ne ukloni.
-- Instruktor blokira samo svoja vremena (Dashboard → Moje blokade), admin bilo koja.
-- Zabrana je i dalje u bazi (okidač), da važi za svaki put zakazivanja: forma, više časova odjednom,
-- dodela instruktora, Swap, premeštanje, zahtev učenika sa izabranim instruktorom.

ALTER TABLE blokirani_termini
  ADD COLUMN IF NOT EXISTS instructor_id UUID REFERENCES instructors(id) ON DELETE CASCADE;

-- Ranije: jedna blokada po (datum, vreme). Sada: jedna "za sve" + po jedna za svakog instruktora.
ALTER TABLE blokirani_termini DROP CONSTRAINT IF EXISTS blokirani_termini_date_slot_index_key;
CREATE UNIQUE INDEX IF NOT EXISTS blokirani_termini_svi_uniq
  ON blokirani_termini (date, slot_index) WHERE instructor_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS blokirani_termini_instruktor_uniq
  ON blokirani_termini (date, slot_index, instructor_id) WHERE instructor_id IS NOT NULL;

-- Stalna nedeljna blokada: dan u nedelji (1 = ponedeljak … 7 = nedelja) + vreme, za jednog instruktora.
CREATE TABLE IF NOT EXISTS instruktor_nedeljne_blokade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  dan SMALLINT NOT NULL CHECK (dan BETWEEN 1 AND 7),
  slot_index SMALLINT NOT NULL CHECK (slot_index BETWEEN 0 AND 15),
  napomena TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instructor_id, dan, slot_index)
);

ALTER TABLE instruktor_nedeljne_blokade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Nedeljne blokade readable by authenticated" ON instruktor_nedeljne_blokade;
CREATE POLICY "Nedeljne blokade readable by authenticated" ON instruktor_nedeljne_blokade
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage nedeljne blokade" ON instruktor_nedeljne_blokade;
CREATE POLICY "Admins manage nedeljne blokade" ON instruktor_nedeljne_blokade
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

CREATE OR REPLACE FUNCTION proveri_blokiran_termin() RETURNS trigger AS $$
DECLARE
  d DATE;
  s SMALLINT;
  instr UUID;
  premesten BOOLEAN := true;
  razlog TEXT;
  ime TEXT;
BEGIN
  IF TG_TABLE_NAME = 'terms' THEN
    IF TG_OP = 'UPDATE'
       AND NEW.date IS NOT DISTINCT FROM OLD.date
       AND NEW.slot_index IS NOT DISTINCT FROM OLD.slot_index THEN
      -- Termin ostaje gde jeste: menja se samo instruktor (ili ništa bitno).
      IF NEW.instructor_id IS NOT DISTINCT FROM OLD.instructor_id THEN
        RETURN NEW;
      END IF;
      premesten := false;
    END IF;
    d := NEW.date;
    s := NEW.slot_index;
    instr := NEW.instructor_id;
  ELSE
    d := NEW.requested_date;
    s := NEW.requested_slot_index;
    instr := NEW.instructor_id;
  END IF;

  -- Blokada za sve: važi za nov ili premešten termin (termin koji je već stajao u slotu pre
  -- blokiranja i dalje može da promeni instruktora/učionicu).
  IF premesten THEN
    SELECT napomena INTO razlog FROM blokirani_termini WHERE date = d AND slot_index = s AND instructor_id IS NULL;
    IF FOUND THEN
      RAISE EXCEPTION 'Termin % je blokiran za zakazivanje%', to_char(d, 'DD.MM.YYYY'),
        COALESCE(' (' || NULLIF(razlog, '') || ')', '') || '.';
    END IF;
  END IF;

  -- Blokada samo za ovog instruktora.
  IF instr IS NOT NULL THEN
    SELECT b.napomena, i.ime || ' ' || i.prezime INTO razlog, ime
    FROM blokirani_termini b
    JOIN instructors i ON i.id = b.instructor_id
    WHERE b.date = d AND b.slot_index = s AND b.instructor_id = instr;
    IF FOUND THEN
      RAISE EXCEPTION 'Instruktor % je blokiran u terminu %', ime,
        to_char(d, 'DD.MM.YYYY') || COALESCE(' (' || NULLIF(razlog, '') || ')', '') || '.';
    END IF;

    SELECT n.napomena, i.ime || ' ' || i.prezime INTO razlog, ime
    FROM instruktor_nedeljne_blokade n
    JOIN instructors i ON i.id = n.instructor_id
    WHERE n.instructor_id = instr AND n.dan = EXTRACT(ISODOW FROM d)::SMALLINT AND n.slot_index = s;
    IF FOUND THEN
      RAISE EXCEPTION 'Instruktor % ne radi u to vreme (stalna nedeljna blokada) – %', ime,
        to_char(d, 'DD.MM.YYYY') || COALESCE(' (' || NULLIF(razlog, '') || ')', '') || '.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS terms_blokiran_termin ON terms;
CREATE TRIGGER terms_blokiran_termin
  BEFORE INSERT OR UPDATE OF date, slot_index, instructor_id ON terms
  FOR EACH ROW EXECUTE FUNCTION proveri_blokiran_termin();

DROP TRIGGER IF EXISTS zahtevi_blokiran_termin ON zahtevi_za_cas;
CREATE TRIGGER zahtevi_blokiran_termin
  BEFORE INSERT ON zahtevi_za_cas
  FOR EACH ROW EXECUTE FUNCTION proveri_blokiran_termin();

-- Ako je pokrenuta 045 (automatsko osvežavanje kalendara), i nedeljne blokade javljaju kalendaru promenu.
DO $$
BEGIN
  IF to_regprocedure('public.obavesti_kalendar()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS obavesti_kalendar_ins_del ON public.instruktor_nedeljne_blokade;
    DROP TRIGGER IF EXISTS obavesti_kalendar_upd ON public.instruktor_nedeljne_blokade;
    CREATE TRIGGER obavesti_kalendar_ins_del AFTER INSERT OR DELETE ON public.instruktor_nedeljne_blokade
      FOR EACH ROW EXECUTE FUNCTION public.obavesti_kalendar();
    CREATE TRIGGER obavesti_kalendar_upd AFTER UPDATE ON public.instruktor_nedeljne_blokade
      FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.obavesti_kalendar();
  END IF;
END $$;
