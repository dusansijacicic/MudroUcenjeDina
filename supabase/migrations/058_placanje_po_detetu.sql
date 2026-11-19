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
