-- Klijent pri zakazivanju vidi koje slotove su zauzeti (termin ima bar jedno predavanje).
-- Vraća samo brojeve slotova, bez podataka o drugim klijentima.

CREATE OR REPLACE FUNCTION public.get_occupied_slots(p_date date)
RETURNS SETOF smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT t.slot_index
  FROM terms t
  WHERE t.date = p_date
    AND EXISTS (SELECT 1 FROM predavanja p WHERE p.term_id = t.id);
$$;

GRANT EXECUTE ON FUNCTION public.get_occupied_slots(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_occupied_slots(date) TO anon;

COMMENT ON FUNCTION public.get_occupied_slots(date) IS 'Vraća slot_index koji na dat datum imaju bar jedno predavanje (zauzeti termini). Za prikaz klijentu pri zakazivanju.';
