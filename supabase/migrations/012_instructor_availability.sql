-- Dostupnost predavača: nedeljni raspored (koji slotovi su dostupni koji dan u nedelji).
-- day_of_week: ISO 1 = Ponedeljak, 7 = Nedelja.

CREATE TABLE instructor_weekly_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  slot_index SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index <= 12),
  UNIQUE(instructor_id, day_of_week, slot_index)
);

CREATE INDEX idx_instructor_weekly_availability_instructor ON instructor_weekly_availability(instructor_id);

ALTER TABLE instructor_weekly_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors manage own weekly availability" ON instructor_weekly_availability
  FOR ALL USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- Klijenti moraju da čitaju dostupnost predavača (da bi pri zakazivanju videli samo dostupne slotove).
CREATE POLICY "Clients can read instructor availability" ON instructor_weekly_availability
  FOR SELECT USING (
    instructor_id IN (
      SELECT ic.instructor_id FROM instructor_clients ic
      JOIN clients c ON c.id = ic.client_id
      WHERE c.user_id = auth.uid()
    )
  );

COMMENT ON TABLE instructor_weekly_availability IS 'Nedeljni raspored: koji slot_index je predavač dostupan koji dan (1=Pon..7=Ned).';

-- Izuzetni periodi: dostupnost po periodu (override nad nedeljnim).
CREATE TABLE instructor_availability_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL CHECK (date_to >= date_from),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  slot_index SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index <= 12),
  UNIQUE(instructor_id, date_from, date_to, day_of_week, slot_index)
);

CREATE INDEX idx_instructor_availability_periods_instructor ON instructor_availability_periods(instructor_id);
CREATE INDEX idx_instructor_availability_periods_dates ON instructor_availability_periods(instructor_id, date_from, date_to);

ALTER TABLE instructor_availability_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors manage own availability periods" ON instructor_availability_periods
  FOR ALL USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

CREATE POLICY "Clients can read instructor availability periods" ON instructor_availability_periods
  FOR SELECT USING (
    instructor_id IN (
      SELECT ic.instructor_id FROM instructor_clients ic
      JOIN clients c ON c.id = ic.client_id
      WHERE c.user_id = auth.uid()
    )
  );

COMMENT ON TABLE instructor_availability_periods IS 'Dostupnost po periodu: za date_from..date_to, koji dan i slot. Ako postoji za datum, override-uje nedeljni raspored.';


-- RPC: vraća slot_index vrednosti za koje je predavač dostupan na dat datum.
-- Ako postoji period koji pokriva datum, koristi se samo period; inače nedeljni raspored.
CREATE OR REPLACE FUNCTION public.get_instructor_available_slots(
  p_instructor_id UUID,
  p_date DATE
)
RETURNS SETOF smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH period_slots AS (
    SELECT slot_index
    FROM instructor_availability_periods
    WHERE instructor_id = p_instructor_id
      AND p_date BETWEEN date_from AND date_to
      AND day_of_week = EXTRACT(ISODOW FROM p_date)::smallint
  ),
  weekly_slots AS (
    SELECT slot_index
    FROM instructor_weekly_availability
    WHERE instructor_id = p_instructor_id
      AND day_of_week = EXTRACT(ISODOW FROM p_date)::smallint
  )
  SELECT DISTINCT slot_index FROM (
    SELECT slot_index FROM period_slots
    UNION ALL
    SELECT slot_index FROM weekly_slots
    WHERE NOT EXISTS (SELECT 1 FROM period_slots LIMIT 1)
  ) s
  ORDER BY slot_index;
$$;

GRANT EXECUTE ON FUNCTION public.get_instructor_available_slots(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_instructor_available_slots(uuid, date) TO anon;

COMMENT ON FUNCTION public.get_instructor_available_slots(uuid, date) IS 'Vraća slot_index u kojima je predavač dostupan na dat datum (prema nedeljnom rasporedu).';
