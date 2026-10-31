-- Plaćanje po paketima (049) i za časove kojima nešto fali – pre svega zahtevi bez instruktora/učionice
-- napravljeni bez vrste časa (npr. "Više termina" bez izabrane vrste). Do sada su takvi časovi bili
-- posebna grupa "bez vrste", pa ih oznaka plaćeno na npr. Matematici nije pokrivala i uz njih nije
-- pisalo ništa.
--
-- Pravila:
--  * Čas bez vrste se računa u vrstu poslednje oznake "plaćeno" tog deteta pre (ili baš na) tom času.
--    Pre prve oznake ostaje bez vrste – kao i do sada se ne broji.
--  * Oznaka napravljena na času bez vrste dobija vrstu prvog sledećeg časa tog deteta koji ima vrstu
--    (a ako takvog nema, poslednjeg prethodnog). Dete koje nema nijedan čas sa vrstom → ostaje "bez vrste"
--    i paket pokriva njegove časove bez vrste.
--  * Kad se času naknadno dodeli vrsta (ili instruktor), sve se samo preračuna – ništa se ne čuva po času.

-- Svi časovi koji ulaze u brojanje: predavanja (osim NASTAVAK termina) i zahtevi na čekanju.
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
    AND (p_klijenti IS NULL OR z.client_id = ANY (p_klijenti));
$$;

-- Oznake "plaćeno od ovog časa" sa vrstom kojoj stvarno pripadaju (o_tip): oznaka bez vrste dobija vrstu
-- najbližeg (prvo sledećeg, pa prethodnog) časa tog deteta koji ima vrstu.
CREATE OR REPLACE FUNCTION public.oznake_placanja(p_klijenti UUID[] DEFAULT NULL)
RETURNS TABLE (
  o_id UUID,
  o_client UUID,
  o_tip UUID,
  o_datum DATE,
  o_slot SMALLINT,
  o_broj INT,
  o_created TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH sa_vrstom AS (
    SELECT cs.c_client, cs.c_tip, cs.c_datum, cs.c_slot
    FROM public.casovi_za_placanje(p_klijenti) cs
    WHERE cs.c_tip IS NOT NULL
  )
  SELECT pp.id,
         pp.client_id,
         COALESCE(
           pp.term_type_id,
           (SELECT sv.c_tip FROM sa_vrstom sv
             WHERE sv.c_client = pp.client_id AND (sv.c_datum, sv.c_slot) >= (pp.od_datum, pp.od_slot)
             ORDER BY sv.c_datum, sv.c_slot
             LIMIT 1),
           (SELECT sv.c_tip FROM sa_vrstom sv
             WHERE sv.c_client = pp.client_id AND (sv.c_datum, sv.c_slot) < (pp.od_datum, pp.od_slot)
             ORDER BY sv.c_datum DESC, sv.c_slot DESC
             LIMIT 1)
         ),
         pp.od_datum,
         pp.od_slot,
         pp.broj_casova::INT,
         pp.created_at
  FROM placeni_paketi pp
  WHERE p_klijenti IS NULL OR pp.client_id = ANY (p_klijenti);
$$;

-- Isti algoritam kao u 049, samo što časovi i oznake bez vrste dobijaju vrstu po pravilima iznad.
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
BEGIN
  FOR c IN
    WITH oznake AS (
      SELECT * FROM public.oznake_placanja(p_klijenti)
    ),
    svi AS (
      SELECT cs.c_id AS id,
             cs.c_client AS client_id,
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
    ),
    sa_prethodnim AS (
      SELECT s.*,
             LAG(s.datum) OVER w AS pre_datum,
             LAG(s.slot) OVER w AS pre_slot
      FROM svi s
      WINDOW w AS (PARTITION BY s.client_id, s.term_type_id ORDER BY s.datum, s.slot, s.id)
    )
    SELECT sp.*,
           -- Paketi čiji je trenutak posle prethodnog časa, a najkasnije na ovom času, kreću od ovog časa.
           (SELECT COALESCE(SUM(o.o_broj), 0)::INT
            FROM oznake o
            WHERE o.o_client = sp.client_id
              AND o.o_tip IS NOT DISTINCT FROM sp.term_type_id
              AND (o.o_datum, o.o_slot) <= (sp.datum, sp.slot)
              AND (sp.pre_datum IS NULL OR (o.o_datum, o.o_slot) > (sp.pre_datum, sp.pre_slot))
           ) AS dodato
    FROM sa_prethodnim sp
    ORDER BY sp.client_id, sp.term_type_id, sp.datum, sp.slot, sp.id
  LOOP
    IF prvi OR c.client_id IS DISTINCT FROM pre_client OR c.term_type_id IS DISTINCT FROM pre_tip THEN
      prvi := false;
      pre_client := c.client_id;
      pre_tip := c.term_type_id;
      kredit := 0;
      grupa := 0;
      rb := 0;
      zapoceto := false;
    END IF;

    IF c.dodato > 0 THEN
      IF kredit = 0 THEN
        -- Nov paket posle praznog hoda (ili prvi): brojanje kreće ispočetka.
        grupa := grupa + 1;
        rb := 0;
      END IF;
      zapoceto := true;
      kredit := kredit + c.dodato;
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
      r_kredit := c.dodato;
    ELSE
      r_brojan := false;
      r_placen := false;
      r_grupa := NULL;
      r_x := NULL;
      r_kredit := 0;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Stanje po detetu i vrsti (kao u 049), plaćeno sada po vrsti kojoj oznaka stvarno pripada.
CREATE OR REPLACE FUNCTION public.stanje_placanja(p_klijenti UUID[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH casovi AS (
    SELECT r_client AS client_id, r_tip AS term_type_id,
           COUNT(*) FILTER (WHERE r_odrzan)::INT AS odrzano,
           COUNT(*) FILTER (WHERE r_brojan AND r_odrzan AND NOT r_placen)::INT AS duguje,
           COUNT(*) FILTER (WHERE r_odrzan AND r_placen)::INT AS pokriveno
    FROM public.placanje_po_casovima(p_klijenti)
    GROUP BY r_client, r_tip
  ),
  paketi AS (
    SELECT o_client AS client_id, o_tip AS term_type_id, SUM(o_broj)::INT AS placeno
    FROM public.oznake_placanja(p_klijenti)
    GROUP BY o_client, o_tip
  ),
  kljucevi AS (
    SELECT client_id, term_type_id FROM casovi
    UNION
    SELECT client_id, term_type_id FROM paketi
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_array(
           k.client_id,
           k.term_type_id,
           COALESCE(pk.placeno, 0),
           COALESCE(c.odrzano, 0),
           COALESCE(c.duguje, 0),
           GREATEST(COALESCE(pk.placeno, 0) - COALESCE(c.pokriveno, 0), 0)
         )), '[]'::jsonb)
  FROM kljucevi k
  LEFT JOIN casovi c ON c.client_id = k.client_id AND c.term_type_id IS NOT DISTINCT FROM k.term_type_id
  LEFT JOIN paketi pk ON pk.client_id = k.client_id AND pk.term_type_id IS NOT DISTINCT FROM k.term_type_id
  WHERE COALESCE(pk.placeno, 0) > 0 OR COALESCE(c.odrzano, 0) > 0;
$$;

-- Samo server (service role).
REVOKE ALL ON FUNCTION public.casovi_za_placanje(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oznake_placanja(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.placanje_po_casovima(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stanje_placanja(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.casovi_za_placanje(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.oznake_placanja(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.placanje_po_casovima(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.stanje_placanja(UUID[]) TO service_role;
