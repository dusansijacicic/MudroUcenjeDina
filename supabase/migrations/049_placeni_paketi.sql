-- Plaćanje po paketima: admin na kalendaru (mod "Označi plaćeno") klikne dete u terminu od kog je plaćeno –
-- taj čas i sledećih 5 časova tog deteta iste vrste su plaćeni (paket od 6). To je JEDINI pokazatelj da je
-- plaćeno: uplate (Evidencija uplata) ostaju samo evidencija novca i više ne utiču na "plaćeno".
--
-- Pravila (po detetu i vrsti časa, hronološki kroz sve časove – održane, zakazane i one bez instruktora):
--  * Pre prve oznake ništa se ne računa i ništa se ne prikazuje (dete bez oznake nema natpis "plaćeno").
--  * Oznaka važi od trenutka (datum + vreme) izabranog časa; ako se taj čas obriše ili pomeri, paket kreće
--    od prvog sledećeg časa.
--  * Paketi se sabiraju: nova oznaka dok prethodni paket još traje dodaje 6 časova na kraj.
--  * Čas posle potrošenog paketa (a pre sledeće oznake) = NIJE PLAĆENO.
--  * NASTAVAK termini se ne broje (isto kao do sada).

CREATE TABLE IF NOT EXISTS placeni_paketi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  term_type_id UUID REFERENCES term_types(id) ON DELETE SET NULL,
  od_datum DATE NOT NULL,
  od_slot SMALLINT NOT NULL CHECK (od_slot BETWEEN 0 AND 15),
  broj_casova SMALLINT NOT NULL DEFAULT 6 CHECK (broj_casova > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT placeni_paketi_uniq UNIQUE NULLS NOT DISTINCT (client_id, term_type_id, od_datum, od_slot)
);
CREATE INDEX IF NOT EXISTS placeni_paketi_od_datum_idx ON placeni_paketi (od_datum);

ALTER TABLE placeni_paketi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Placeni paketi readable by authenticated" ON placeni_paketi;
CREATE POLICY "Placeni paketi readable by authenticated" ON placeni_paketi
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage placeni paketi" ON placeni_paketi;
CREATE POLICY "Admins manage placeni paketi" ON placeni_paketi
  FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

-- Svaki čas (predavanje ili zahtev na čekanju) sa stanjem plaćanja. r_grupa = redni broj paketa
-- (niz uzastopnih plaćenih časova + neplaćeni posle njega), r_x = koji je čas u toj grupi,
-- r_kredit = koliko je plaćenih časova dodato baš na ovom času. y = SUM(r_kredit) po grupi.
-- p_klijenti = NULL → svi klijenti.
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
    WITH svi AS (
      SELECT p.id, p.client_id, p.term_type_id, t.date AS datum, t.slot_index::SMALLINT AS slot,
             (p.odrzano
               OR t.date + time '09:00' + (t.slot_index + 1) * interval '45 minutes' < (now() AT TIME ZONE 'Europe/Belgrade')
             ) AS odrzan
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
           (SELECT COALESCE(SUM(pp.broj_casova), 0)::INT
            FROM placeni_paketi pp
            WHERE pp.client_id = sp.client_id
              AND pp.term_type_id IS NOT DISTINCT FROM sp.term_type_id
              AND (pp.od_datum, pp.od_slot) <= (sp.datum, sp.slot)
              AND (sp.pre_datum IS NULL OR (pp.od_datum, pp.od_slot) > (sp.pre_datum, sp.pre_slot))
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

-- Kalendar / termin / stranica instruktora: {id časa ili zahteva: [x, y]} samo za časove posle prve oznake.
-- x ≤ y → x-ti od y plaćenih; x > y → nije plaćeno. Časovi bez oznake nemaju unos (ništa se ne prikazuje).
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
    SELECT q.*, SUM(q.r_kredit) OVER (PARTITION BY q.r_client, q.r_tip, q.r_grupa) AS y
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
    SELECT q.*, SUM(q.r_kredit) OVER (PARTITION BY q.r_client, q.r_tip, q.r_grupa) AS y
    FROM public.placanje_po_casovima(ARRAY[p_client]) q
  )
  SELECT COALESCE(jsonb_object_agg(r.r_id, jsonb_build_array(r.r_x, r.y)), '{}'::jsonb)
  FROM r
  WHERE r.r_brojan;
$$;

-- Stanje po detetu i vrsti: [client_id, term_type_id, placeno, odrzano, nije_placeno, preostalo]
--  placeno      = zbir časova iz paketa
--  odrzano      = svi održani časovi te vrste (i pre prve oznake)
--  nije_placeno = održani časovi posle prve oznake koje nijedan paket ne pokriva
--  preostalo    = plaćeni časovi koji još nisu održani
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
    SELECT client_id, term_type_id, SUM(broj_casova)::INT AS placeno
    FROM placeni_paketi
    WHERE p_klijenti IS NULL OR client_id = ANY (p_klijenti)
    GROUP BY client_id, term_type_id
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

-- Lista klijenata zove ovu funkciju (046) – sada vraća stanje po paketima (6 polja umesto 4).
CREATE OR REPLACE FUNCTION public.stanje_svih_klijenata()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.stanje_placanja(NULL);
$$;

-- Samo server (service role) – ne otvara se ka anon/ulogovanim korisnicima.
REVOKE ALL ON FUNCTION public.placanje_po_casovima(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redni_broj_casova(DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redni_broj_casova_klijenta(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stanje_placanja(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stanje_svih_klijenata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.placanje_po_casovima(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.redni_broj_casova(DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.redni_broj_casova_klijenta(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.stanje_placanja(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.stanje_svih_klijenata() TO service_role;

-- Ako je pokrenuta 045 (automatsko osvežavanje kalendara), i oznake plaćanja osvežavaju kalendar.
DO $$
BEGIN
  IF to_regprocedure('public.obavesti_kalendar()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS obavesti_kalendar_ins_del ON public.placeni_paketi;
    DROP TRIGGER IF EXISTS obavesti_kalendar_upd ON public.placeni_paketi;
    CREATE TRIGGER obavesti_kalendar_ins_del AFTER INSERT OR DELETE ON public.placeni_paketi
      FOR EACH ROW EXECUTE FUNCTION public.obavesti_kalendar();
    CREATE TRIGGER obavesti_kalendar_upd AFTER UPDATE ON public.placeni_paketi
      FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.obavesti_kalendar();
  END IF;
END $$;
