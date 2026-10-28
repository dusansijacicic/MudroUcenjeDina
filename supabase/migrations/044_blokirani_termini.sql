-- Blokirani termini: ceo vremenski slot jednog dana (sve učionice, svi predavači) se izuzima iz
-- zakazivanja, uz napomenu ZAŠTO. Zabrana je u samoj bazi (okidač), da ne bi zavisila od toga
-- kojim putem se zakazuje (admin, predavač, zahtev učenika, Swap/Copy/premeštanje, bulk...).
-- Termini koji su već bili zakazani u slotu PRE blokiranja ostaju (ne brišu se) – prikazuju se na
-- stranici Admin → Blokirani termini kao "treba premestiti".
CREATE TABLE IF NOT EXISTS blokirani_termini (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  slot_index SMALLINT NOT NULL,
  napomena TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, slot_index)
);

CREATE INDEX IF NOT EXISTS blokirani_termini_date_idx ON blokirani_termini (date);

ALTER TABLE blokirani_termini ENABLE ROW LEVEL SECURITY;

-- Svi ulogovani mogu da vide šta je blokirano (predavači i učenici treba da znaju zašto ne mogu da zakažu).
CREATE POLICY "Blokirani termini readable by authenticated" ON blokirani_termini
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage blokirani termini" ON blokirani_termini
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

-- Okidač: odbija novi/premešteni termin i novi zahtev u blokiranom slotu.
CREATE OR REPLACE FUNCTION proveri_blokiran_termin() RETURNS trigger AS $$
DECLARE
  d DATE;
  s SMALLINT;
  razlog TEXT;
BEGIN
  IF TG_TABLE_NAME = 'terms' THEN
    -- Izmena koja ne pomera termin (npr. Swap samo instruktora, promena učionice) je dozvoljena
    -- i za termine koji su ostali u slotu blokiranom posle njihovog zakazivanja.
    IF TG_OP = 'UPDATE' AND NEW.date IS NOT DISTINCT FROM OLD.date AND NEW.slot_index IS NOT DISTINCT FROM OLD.slot_index THEN
      RETURN NEW;
    END IF;
    d := NEW.date;
    s := NEW.slot_index;
  ELSE
    d := NEW.requested_date;
    s := NEW.requested_slot_index;
  END IF;

  SELECT napomena INTO razlog FROM blokirani_termini WHERE date = d AND slot_index = s;
  IF FOUND THEN
    RAISE EXCEPTION 'Termin % je blokiran za zakazivanje%', to_char(d, 'DD.MM.YYYY'),
      COALESCE(' (' || NULLIF(razlog, '') || ')', '') || '.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS terms_blokiran_termin ON terms;
CREATE TRIGGER terms_blokiran_termin
  BEFORE INSERT OR UPDATE OF date, slot_index ON terms
  FOR EACH ROW EXECUTE FUNCTION proveri_blokiran_termin();

DROP TRIGGER IF EXISTS zahtevi_blokiran_termin ON zahtevi_za_cas;
CREATE TRIGGER zahtevi_blokiran_termin
  BEFORE INSERT ON zahtevi_za_cas
  FOR EACH ROW EXECUTE FUNCTION proveri_blokiran_termin();
