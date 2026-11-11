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
