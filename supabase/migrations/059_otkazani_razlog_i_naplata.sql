-- Otkazani časovi: razlog otkazivanja i naplaćeni otkazani čas koji se računa u plaćene časove.
--
--  * otkazani_termini.razlog – zašto je čas otkazan (upisuje se pri otkazivanju na kalendaru ili na
--    profilu deteta; nije obavezno).
--  * Otkazan čas koji je NAPLAĆEN (placeno = true) računa se kao održan čas deteta: troši jedan čas iz
--    plaćenog paketa i ima svoj redni broj „x/6“ (sve vrste zajedno, kao u 058). Nenaplaćen otkazan čas
--    se ne broji.
--  * Kalendar (kalendar_podaci) uz otkazane vraća i razlog.

ALTER TABLE otkazani_termini ADD COLUMN IF NOT EXISTS razlog TEXT;
CREATE INDEX IF NOT EXISTS idx_otkazani_termini_client ON otkazani_termini (client_id) WHERE client_id IS NOT NULL;

-- Svi časovi koji ulaze u brojanje: predavanja (osim NASTAVAK termina), zahtevi na čekanju i
-- naplaćeni otkazani časovi (oni su „potrošeni“ – broje se kao održani).
CREATE OR REPLACE FUNCTION public.casovi_za_placanje(p_klijenti UUID[] DEFAULT NULL)
RETURNS TABLE (
  c_id UUID,
  c_client UUID,
  c_tip UUID,
  c_datum DATE,
  c_slot SMALLINT,
  c_odrzan BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.client_id, p.term_type_id, t.date, t.slot_index::SMALLINT,
         (p.odrzano
           OR t.date + time '09:00' + (t.slot_index + 1) * interval '45 minutes' < (now() AT TIME ZONE 'Europe/Belgrade')
         )
  FROM predavanja p
  JOIN terms t ON t.id = p.term_id
  LEFT JOIN term_categories k ON k.id = t.term_category_id
  WHERE COALESCE(k.is_nastavak, false) = false
    AND (p_klijenti IS NULL OR p.client_id = ANY (p_klijenti))
  UNION ALL
  SELECT z.id, z.client_id, z.term_type_id, z.requested_date, z.requested_slot_index::SMALLINT, false
  FROM zahtevi_za_cas z
  WHERE z.status = 'pending'
    AND (p_klijenti IS NULL OR z.client_id = ANY (p_klijenti))
  UNION ALL
  SELECT o.id, o.client_id, NULL::UUID, o.term_date, o.slot_index::SMALLINT, true
  FROM otkazani_termini o
  WHERE o.placeno
    AND o.client_id IS NOT NULL
    AND (p_klijenti IS NULL OR o.client_id = ANY (p_klijenti));
$$;

-- "x / y" za kalendar: i dete koje u prikazanom periodu ima samo naplaćen otkazan čas.
CREATE OR REPLACE FUNCTION public.redni_broj_casova(p_from DATE, p_to DATE)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH deca AS (
    SELECT p.client_id
    FROM predavanja p
    JOIN terms t ON t.id = p.term_id
    WHERE t.date BETWEEN p_from AND p_to
    UNION
    SELECT z.client_id
    FROM zahtevi_za_cas z
    WHERE z.status = 'pending' AND z.requested_date BETWEEN p_from AND p_to
    UNION
    SELECT o.client_id
    FROM otkazani_termini o
    WHERE o.placeno AND o.client_id IS NOT NULL AND o.term_date BETWEEN p_from AND p_to
  ),
  r AS (
    SELECT q.*, SUM(q.r_kredit) OVER (PARTITION BY q.r_client, q.r_grupa) AS y
    FROM public.placanje_po_casovima((SELECT COALESCE(array_agg(client_id), '{}'::UUID[]) FROM deca)) q
  )
  SELECT COALESCE(jsonb_object_agg(r.r_id, jsonb_build_array(r.r_x, r.y)), '{}'::jsonb)
  FROM r
  WHERE r.r_brojan AND r.r_datum BETWEEN p_from AND p_to;
$$;

-- Kalendar jednim pozivom (056) – otkazani sada nose i razlog.
CREATE OR REPLACE FUNCTION public.kalendar_podaci(p_from DATE, p_to DATE)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    -- Termini sa instruktorom, učionicom, kategorijom, decom (i njihovom vrstom) i decom sa testiranja.
    'terms', COALESCE((
      SELECT jsonb_agg(
               to_jsonb(t) || jsonb_build_object(
                 'instructor', (SELECT jsonb_build_object('id', i.id, 'ime', i.ime, 'prezime', i.prezime, 'color', i.color)
                                FROM instructors i WHERE i.id = t.instructor_id),
                 'classroom', (SELECT jsonb_build_object('id', c.id, 'naziv', c.naziv, 'color', c.color)
                               FROM classrooms c WHERE c.id = t.classroom_id),
                 'term_category', (SELECT jsonb_build_object('id', k.id, 'naziv', k.naziv, 'is_testing', k.is_testing)
                                   FROM term_categories k WHERE k.id = t.term_category_id),
                 'predavanja', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                            'id', p.id,
                            'client_id', p.client_id,
                            'term_type_id', p.term_type_id,
                            'client', (SELECT jsonb_build_object('id', cl.id, 'ime', cl.ime, 'prezime', cl.prezime)
                                       FROM clients cl WHERE cl.id = p.client_id),
                            'term_type', (SELECT jsonb_build_object('naziv', tt.naziv) FROM term_types tt WHERE tt.id = p.term_type_id)
                          ))
                   FROM predavanja p WHERE p.term_id = t.id
                 ), '[]'::jsonb),
                 'potential_clients', COALESCE((
                   SELECT jsonb_agg(to_jsonb(pc)) FROM potential_clients pc WHERE pc.term_id = t.id
                 ), '[]'::jsonb)
               )
               ORDER BY t.date, t.slot_index
             )
      FROM terms t
      WHERE t.date BETWEEN p_from AND p_to
    ), '[]'::jsonb),

    'otkazani', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id, 'client_id', o.client_id, 'client_ime', o.client_ime, 'client_prezime', o.client_prezime,
               'instructor_id', o.instructor_id, 'instructor_ime', o.instructor_ime, 'instructor_prezime', o.instructor_prezime,
               'term_date', o.term_date, 'slot_index', o.slot_index, 'term_type_naziv', o.term_type_naziv, 'placeno', o.placeno,
               'razlog', o.razlog
             ))
      FROM otkazani_termini o
      WHERE o.term_date BETWEEN p_from AND p_to
    ), '[]'::jsonb),

    -- Časovi bez instruktora u prikazanom periodu.
    'zahtevi', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', z.id, 'client_id', z.client_id, 'term_type_id', z.term_type_id,
               'requested_date', z.requested_date, 'requested_slot_index', z.requested_slot_index,
               'client', (SELECT jsonb_build_object('ime', cl.ime, 'prezime', cl.prezime) FROM clients cl WHERE cl.id = z.client_id),
               'term_type', (SELECT jsonb_build_object('naziv', tt.naziv) FROM term_types tt WHERE tt.id = z.term_type_id),
               'classroom', (SELECT jsonb_build_object('naziv', c.naziv) FROM classrooms c WHERE c.id = z.classroom_id)
             ))
      FROM zahtevi_za_cas z
      WHERE z.status = 'pending' AND z.requested_date BETWEEN p_from AND p_to
    ), '[]'::jsonb),

    -- Žuta traka: svi dani (i van prikaza) sa časom bez instruktora čiji podsetnik nije uklonjen (055).
    'podsetnik', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('requested_date', d.requested_date) ORDER BY d.requested_date)
      FROM (
        SELECT DISTINCT requested_date FROM zahtevi_za_cas WHERE status = 'pending' AND NOT podsetnik_skriven
      ) d
    ), '[]'::jsonb),

    'blokade', COALESCE((
      SELECT jsonb_agg(to_jsonb(b)) FROM blokirani_termini b WHERE b.date BETWEEN p_from AND p_to
    ), '[]'::jsonb),

    'nedeljne', COALESCE((SELECT jsonb_agg(to_jsonb(n)) FROM instruktor_nedeljne_blokade n), '[]'::jsonb),

    'paketi', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pp.id, 'client_id', pp.client_id, 'term_type_id', pp.term_type_id,
               'od_datum', pp.od_datum, 'od_slot', pp.od_slot, 'broj_casova', pp.broj_casova
             ))
      FROM placeni_paketi pp
      WHERE pp.od_datum BETWEEN p_from AND p_to
    ), '[]'::jsonb),

    -- "x / y" uz svako dete (047–051).
    'redni', public.redni_broj_casova(p_from, p_to),

    'instruktori', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'ime', i.ime, 'prezime', i.prezime, 'color', i.color, 'aktivan', i.aktivan)
                       ORDER BY i.prezime, i.ime)
      FROM instructors i
    ), '[]'::jsonb),

    'ucionice', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'naziv', c.naziv) ORDER BY c.naziv) FROM classrooms c
    ), '[]'::jsonb),

    'klijenti', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cl.id, 'ime', cl.ime, 'prezime', cl.prezime, 'godiste', cl.godiste,
                                          'datum_testiranja', cl.datum_testiranja)
                       ORDER BY cl.ime, cl.prezime)
      FROM clients cl
    ), '[]'::jsonb),

    'vrste', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', tt.id, 'naziv', tt.naziv, 'opis', tt.opis, 'cena_po_casu', tt.cena_po_casu,
                                          'program_id', tt.program_id, 'trajanje_minuta', tt.trajanje_minuta)
                       ORDER BY tt.naziv)
      FROM term_types tt
    ), '[]'::jsonb),

    'kategorije', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', k.id, 'naziv', k.naziv, 'opis', k.opis,
                                          'jedan_klijent_po_terminu', k.jedan_klijent_po_terminu,
                                          'is_testing', k.is_testing, 'is_nastavak', k.is_nastavak)
                       ORDER BY k.naziv)
      FROM term_categories k
    ), '[]'::jsonb),

    'max_termina_po_slotu', (SELECT s.value FROM app_settings s WHERE s.key = 'max_termina_po_slotu')
  );
$$;

REVOKE ALL ON FUNCTION public.casovi_za_placanje(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redni_broj_casova(DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kalendar_podaci(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.casovi_za_placanje(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.redni_broj_casova(DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.kalendar_podaci(DATE, DATE) TO service_role;

-- API odmah vidi izmene.
NOTIFY pgrst, 'reload schema';
