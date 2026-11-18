-- Delete bez traga: jedan transakcioni poziv briše izabrane stavke i oznake plaćanja koje počinju na njima.
-- Otkaži, Copy, Premesti i dodela instruktora ne pozivaju ovu funkciju i zadržavaju oznake plaćanja.
CREATE OR REPLACE FUNCTION public.delete_calendar_entries(
  p_term_ids UUID[] DEFAULT '{}',
  p_request_ids UUID[] DEFAULT '{}',
  p_cancelled_ids UUID[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  WITH starts AS (
    SELECT p.client_id, t.date AS datum, t.slot_index
    FROM predavanja p JOIN terms t ON t.id = p.term_id
    WHERE t.id = ANY(p_term_ids)
    UNION
    SELECT z.client_id, z.requested_date, z.requested_slot_index
    FROM zahtevi_za_cas z WHERE z.id = ANY(p_request_ids)
    UNION
    SELECT o.client_id, o.term_date, o.slot_index
    FROM otkazani_termini o WHERE o.id = ANY(p_cancelled_ids)
  )
  DELETE FROM placeni_paketi pp USING starts s
  WHERE pp.client_id = s.client_id AND pp.od_datum = s.datum AND pp.od_slot = s.slot_index;

  UPDATE potential_clients pc
  SET datum_termina = t.date, slot_termina = t.slot_index
  FROM terms t WHERE t.id = pc.term_id AND t.id = ANY(p_term_ids);
  DELETE FROM potential_clients WHERE term_id = ANY(p_term_ids) AND status = 'zakazan';
  DELETE FROM terms
  WHERE id = ANY(p_term_ids)
     OR (nastavak_of_term_id = ANY(p_term_ids) AND napomena = 'Automatski zauzeto (nastavak dužeg časa)');
  DELETE FROM zahtevi_za_cas WHERE id = ANY(p_request_ids);
  DELETE FROM otkazani_termini WHERE id = ANY(p_cancelled_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_calendar_entries(UUID[], UUID[], UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_calendar_entries(UUID[], UUID[], UUID[]) TO service_role;
NOTIFY pgrst, 'reload schema';
