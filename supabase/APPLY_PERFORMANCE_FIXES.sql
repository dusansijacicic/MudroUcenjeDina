-- Dopuna postojece baze: brzi kalendar, placanje testiranja i Delete bez traga.
-- Ne pokretati FULL_RESET. Ovaj paket ne brise postojece podatke.
BEGIN;

-- 051_brze_placanje_po_casovima.sql
-- Brže računanje plaćenih časova (kalendar ga čeka pri svakom učitavanju – "x/6 · još N").
-- Ista pravila kao 049/050, ali umesto da se za SVAKI čas posebno pretražuju sve oznake "plaćeno"
-- (podupit po času), oznake i časovi idu kroz petlju u jednom hronološkom nizu po detetu i vrsti:
-- oznaka se samo zapamti i dodaje se prvom sledećem času (oznaka u istom trenutku kao čas ide pre njega).
-- Rezultat je isti; jedino se menja brzina.

CREATE OR REPLACE FUNCTION public.placanje_po_casovima(p_klijenti UUID[] DEFAULT NULL)
RETURNS TABLE (
  r_id UUID,
  r_client UUID,
  r_tip UUID,
  r_datum DATE,
  r_slot SMALLINT,
  r_odrzan BOOLEAN,
  r_brojan BOOLEAN,
  r_placen BOOLEAN,
  r_grupa INT,
  r_x INT,
  r_kredit INT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c RECORD;
  prvi BOOLEAN := true;
  pre_client UUID;
  pre_tip UUID;
  kredit INT := 0;
  grupa INT := 0;
  rb INT := 0;
  zapoceto BOOLEAN := false;
  na_cekanju INT := 0;
BEGIN
  FOR c IN
    WITH oznake AS (
      SELECT * FROM public.oznake_placanja(p_klijenti)
    ),
    casovi AS (
      SELECT cs.c_id AS id,
             cs.c_client AS client_id,
             -- Čas bez vrste: vrsta poslednje oznake (sa vrstom) tog deteta pre/na tom času (050).
             COALESCE(
               cs.c_tip,
               (SELECT o.o_tip FROM oznake o
                 WHERE o.o_client = cs.c_client
                   AND o.o_tip IS NOT NULL
                   AND (o.o_datum, o.o_slot) <= (cs.c_datum, cs.c_slot)
                 ORDER BY o.o_datum DESC, o.o_slot DESC, o.o_created DESC
                 LIMIT 1)
             ) AS term_type_id,
             cs.c_datum AS datum,
             cs.c_slot AS slot,
             cs.c_odrzan AS odrzan
      FROM public.casovi_za_placanje(p_klijenti) cs
    )
    -- vrsta_reda: 0 = oznaka plaćeno, 1 = čas. Oznaka ide pre časa u istom trenutku.
    SELECT 1 AS vrsta_reda, ca.id, ca.client_id, ca.term_type_id, ca.datum, ca.slot, ca.odrzan, 0 AS broj
    FROM casovi ca
    UNION ALL
    SELECT 0, o.o_id, o.o_client, o.o_tip, o.o_datum, o.o_slot, false, o.o_broj
    FROM oznake o
    ORDER BY 3, 4, 5, 6, 1, 2
  LOOP
    IF prvi OR c.client_id IS DISTINCT FROM pre_client OR c.term_type_id IS DISTINCT FROM pre_tip THEN
      prvi := false;
      pre_client := c.client_id;
      pre_tip := c.term_type_id;
      kredit := 0;
      grupa := 0;
      rb := 0;
      zapoceto := false;
      na_cekanju := 0;
    END IF;

    IF c.vrsta_reda = 0 THEN
      -- Oznaka: važi od prvog sledećeg časa ovog deteta i vrste.
      na_cekanju := na_cekanju + c.broj;
      CONTINUE;
    END IF;

    IF na_cekanju > 0 THEN
      IF kredit = 0 THEN
        -- Nov paket posle praznog hoda (ili prvi): brojanje kreće ispočetka.
        grupa := grupa + 1;
        rb := 0;
      END IF;
      zapoceto := true;
      kredit := kredit + na_cekanju;
    END IF;

    r_id := c.id;
    r_client := c.client_id;
    r_tip := c.term_type_id;
    r_datum := c.datum;
    r_slot := c.slot;
    r_odrzan := c.odrzan;
    IF zapoceto THEN
      rb := rb + 1;
      r_brojan := true;
      r_placen := kredit > 0;
      IF kredit > 0 THEN
        kredit := kredit - 1;
      END IF;
      r_grupa := grupa;
      r_x := rb;
      r_kredit := na_cekanju;
    ELSE
      r_brojan := false;
      r_placen := false;
      r_grupa := NULL;
      r_x := NULL;
      r_kredit := 0;
    END IF;
    na_cekanju := 0;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.placanje_po_casovima(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.placanje_po_casovima(UUID[]) TO service_role;


-- 054_testiranje_placeno.sql
-- Plaćeno testiranje: dete sa testiranja nije klijent (nema pakete časova), pa se plaćanje pamti na
-- samom detetu. Označava se na kalendaru (Označi plaćeno → klik na dete u terminu testiranja) ili na
-- stranici Testiranja / u terminu (dugme „Označi plaćeno“).
ALTER TABLE potential_clients ADD COLUMN IF NOT EXISTS placeno BOOLEAN NOT NULL DEFAULT false;


-- 055_podsetnik_bez_instruktora.sql
-- Podsetnik „termini bez instruktora/učionice“ (žuta traka na kalendaru): admin može da ukloni datum
-- iz trake (✕ uz datum, uz potvrdu). Časovi ostaju na kalendaru – skriva se samo podsetnik za njih.
-- Nov čas bez instruktora tog dana ima false, pa se datum ponovo pojavi u traci.
ALTER TABLE zahtevi_za_cas ADD COLUMN IF NOT EXISTS podsetnik_skriven BOOLEAN NOT NULL DEFAULT false;


-- 056_kalendar_jednim_pozivom.sql
-- Brži kalendar: svi podaci za prikazani period JEDNIM pozivom ka bazi.
-- Do sada je stranica slala ~16 odvojenih upita odjednom; u bazi su se međusobno čekali, pa je i
-- najmanja tabela (učionice, podešavanja) odgovarala tek posle 1–3 s. Ovde se sve izvrši redom u
-- jednoj konekciji i vrati kao jedan JSON – istog oblika kao ranije (aplikacija ništa drugo ne menja).
-- Ako ova funkcija ne postoji, kalendar radi kao i do sada (upit po upit).

-- Časovi bez instruktora se uvek traže po datumu (kalendar, podsetnik, provere zauzetosti).
CREATE INDEX IF NOT EXISTS idx_zahtevi_pending_datum
  ON zahtevi_za_cas (requested_date, requested_slot_index)
  WHERE status = 'pending';

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
               'term_date', o.term_date, 'slot_index', o.slot_index, 'term_type_naziv', o.term_type_naziv, 'placeno', o.placeno
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

-- Samo server (service role) – ne otvara se ka anon/ulogovanim korisnicima.
REVOKE ALL ON FUNCTION public.kalendar_podaci(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kalendar_podaci(DATE, DATE) TO service_role;

-- API (PostgREST) odmah učitava novu funkciju – bez ovoga zna da javi
-- "Could not find the function public.kalendar_podaci … in the schema cache".
NOTIFY pgrst, 'reload schema';


-- 057_delete_calendar_entries.sql
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

NOTIFY pgrst, 'reload schema';

-- 058_placanje_po_detetu.sql
-- Plaćeni časovi se broje PO DETETU, bez obzira na vrstu časa (matematika, reedukacija, čitanje…).
-- Do sada je svaka vrsta imala svoj niz: oznaka „plaćeno“ na Reedukaciji brojala je samo Reedukacije,
-- a ostali časovi tog deteta nisu imali „x/6“. Sada: oznaka „plaćeno od ovog časa“ pokriva taj čas i
-- sledeće časove TOG DETETA redom po datumu i vremenu, kakve god da su vrste (i časove bez vrste).
--
-- Ostala pravila su ista kao u 049–051:
--  * pre prve oznake ništa se ne broji;
--  * oznaka važi od svog trenutka (datum + vreme); ako se taj čas obriše ili pomeri, paket kreće od
--    prvog sledećeg časa deteta;
--  * paketi se sabiraju; čas posle potrošenog paketa (a pre sledeće oznake) = NIJE PLAĆENO;
--  * NASTAVAK termini se ne broje; časovi bez instruktora (zahtevi na čekanju) se broje.
-- Postojeće oznake ostaju; samo se drugačije broje (više nisu vezane za vrstu).

CREATE OR REPLACE FUNCTION public.placanje_po_casovima(p_klijenti UUID[] DEFAULT NULL)
RETURNS TABLE (
  r_id UUID,
  r_client UUID,
  r_tip UUID,
  r_datum DATE,
  r_slot SMALLINT,
  r_odrzan BOOLEAN,
  r_brojan BOOLEAN,
  r_placen BOOLEAN,
  r_grupa INT,
  r_x INT,
  r_kredit INT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c RECORD;
  prvi BOOLEAN := true;
  pre_client UUID;
  kredit INT := 0;
  grupa INT := 0;
  rb INT := 0;
  zapoceto BOOLEAN := false;
  na_cekanju INT := 0;
BEGIN
  FOR c IN
    -- vrsta_reda: 0 = oznaka plaćeno, 1 = čas. Oznaka ide pre časa u istom trenutku.
    SELECT 1 AS vrsta_reda, cs.c_id AS id, cs.c_client AS client_id, cs.c_tip AS term_type_id,
           cs.c_datum AS datum, cs.c_slot AS slot, cs.c_odrzan AS odrzan, 0 AS broj
    FROM public.casovi_za_placanje(p_klijenti) cs
    UNION ALL
    SELECT 0, pp.id, pp.client_id, pp.term_type_id, pp.od_datum, pp.od_slot, false, pp.broj_casova::INT
    FROM placeni_paketi pp
    WHERE p_klijenti IS NULL OR pp.client_id = ANY (p_klijenti)
    ORDER BY 3, 5, 6, 1, 2
  LOOP
    IF prvi OR c.client_id IS DISTINCT FROM pre_client THEN
      prvi := false;
      pre_client := c.client_id;
      kredit := 0;
      grupa := 0;
      rb := 0;
      zapoceto := false;
      na_cekanju := 0;
    END IF;

    IF c.vrsta_reda = 0 THEN
      -- Oznaka: važi od prvog sledećeg časa ovog deteta.
      na_cekanju := na_cekanju + c.broj;
      CONTINUE;
    END IF;

    IF na_cekanju > 0 THEN
      IF kredit = 0 THEN
        -- Nov paket posle praznog hoda (ili prvi): brojanje kreće ispočetka.
        grupa := grupa + 1;
        rb := 0;
      END IF;
      zapoceto := true;
      kredit := kredit + na_cekanju;
    END IF;

    r_id := c.id;
    r_client := c.client_id;
    r_tip := c.term_type_id;
    r_datum := c.datum;
    r_slot := c.slot;
    r_odrzan := c.odrzan;
    IF zapoceto THEN
      rb := rb + 1;
      r_brojan := true;
      r_placen := kredit > 0;
      IF kredit > 0 THEN
        kredit := kredit - 1;
      END IF;
      r_grupa := grupa;
      r_x := rb;
      r_kredit := na_cekanju;
    ELSE
      r_brojan := false;
      r_placen := false;
      r_grupa := NULL;
      r_x := NULL;
      r_kredit := 0;
    END IF;
    na_cekanju := 0;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Kalendar / termin: {id časa ili zahteva: [x, y]} – y = koliko je plaćeno u tom paketu (po detetu).
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
  ),
  r AS (
    SELECT q.*, SUM(q.r_kredit) OVER (PARTITION BY q.r_client, q.r_grupa) AS y
    FROM public.placanje_po_casovima((SELECT COALESCE(array_agg(client_id), '{}'::UUID[]) FROM deca)) q
  )
  SELECT COALESCE(jsonb_object_agg(r.r_id, jsonb_build_array(r.r_x, r.y)), '{}'::jsonb)
  FROM r
  WHERE r.r_brojan AND r.r_datum BETWEEN p_from AND p_to;
$$;

-- Isto, za sve časove jednog deteta (profil klijenta).
CREATE OR REPLACE FUNCTION public.redni_broj_casova_klijenta(p_client UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH r AS (
    SELECT q.*, SUM(q.r_kredit) OVER (PARTITION BY q.r_client, q.r_grupa) AS y
    FROM public.placanje_po_casovima(ARRAY[p_client]) q
  )
  SELECT COALESCE(jsonb_object_agg(r.r_id, jsonb_build_array(r.r_x, r.y)), '{}'::jsonb)
  FROM r
  WHERE r.r_brojan;
$$;

-- Stanje po detetu (jedan red, term_type_id = NULL = sve vrste):
-- [client_id, NULL, placeno, odrzano, nije_placeno, preostalo]
--  placeno      = zbir časova iz svih paketa deteta
--  odrzano      = svi održani časovi deteta (i pre prve oznake)
--  nije_placeno = održani časovi posle prve oznake koje nijedan paket ne pokriva
--  preostalo    = plaćeni časovi koji još nisu održani
CREATE OR REPLACE FUNCTION public.stanje_placanja(p_klijenti UUID[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH casovi AS (
    SELECT r_client AS client_id,
           COUNT(*) FILTER (WHERE r_odrzan)::INT AS odrzano,
           COUNT(*) FILTER (WHERE r_brojan AND r_odrzan AND NOT r_placen)::INT AS duguje,
           COUNT(*) FILTER (WHERE r_odrzan AND r_placen)::INT AS pokriveno
    FROM public.placanje_po_casovima(p_klijenti)
    GROUP BY r_client
  ),
  paketi AS (
    SELECT client_id, SUM(broj_casova)::INT AS placeno
    FROM placeni_paketi
    WHERE p_klijenti IS NULL OR client_id = ANY (p_klijenti)
    GROUP BY client_id
  ),
  kljucevi AS (
    SELECT client_id FROM casovi
    UNION
    SELECT client_id FROM paketi
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_array(
           k.client_id,
           NULL::UUID,
           COALESCE(pk.placeno, 0),
           COALESCE(c.odrzano, 0),
           COALESCE(c.duguje, 0),
           GREATEST(COALESCE(pk.placeno, 0) - COALESCE(c.pokriveno, 0), 0)
         )), '[]'::jsonb)
  FROM kljucevi k
  LEFT JOIN casovi c ON c.client_id = k.client_id
  LEFT JOIN paketi pk ON pk.client_id = k.client_id
  WHERE COALESCE(pk.placeno, 0) > 0 OR COALESCE(c.odrzano, 0) > 0;
$$;

-- Samo server (service role).
REVOKE ALL ON FUNCTION public.placanje_po_casovima(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redni_broj_casova(DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redni_broj_casova_klijenta(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stanje_placanja(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.placanje_po_casovima(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.redni_broj_casova(DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.redni_broj_casova_klijenta(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.stanje_placanja(UUID[]) TO service_role;

-- API odmah vidi izmene.
NOTIFY pgrst, 'reload schema';

-- 059_otkazani_razlog_i_naplata.sql
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

COMMIT;
