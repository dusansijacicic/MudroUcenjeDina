-- Kalendar: uz svako dete u terminu piše "x / y" – koji je to čas po redu (x) od ukupno plaćenih (y)
-- za tu vrstu časa. Ako je x > y, čas nije plaćen i kalendar ga označi crveno.
-- x se broji hronološki kroz SVE časove deteta te vrste (prošle i zakazane); NASTAVAK termini se ne
-- broje, isto kao kod obračuna održanih časova. y = zbir broja časova iz uplata za tu vrstu.
-- Vraća jedan jsonb {predavanje_id: [x, y]} samo za časove u prikazanom periodu kalendara.

CREATE OR REPLACE FUNCTION public.redni_broj_casova(p_from DATE, p_to DATE)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH deca AS (
    SELECT DISTINCT p.client_id
    FROM predavanja p
    JOIN terms t ON t.id = p.term_id
    WHERE t.date BETWEEN p_from AND p_to
  ),
  casovi AS (
    SELECT p.id, p.client_id, p.term_type_id, t.date,
           ROW_NUMBER() OVER (
             PARTITION BY p.client_id, p.term_type_id
             ORDER BY t.date, t.slot_index, p.id
           ) AS redni
    FROM predavanja p
    JOIN deca d ON d.client_id = p.client_id
    JOIN terms t ON t.id = p.term_id
    LEFT JOIN term_categories c ON c.id = t.term_category_id
    WHERE COALESCE(c.is_nastavak, false) = false
  ),
  placeno AS (
    SELECT u.client_id, u.term_type_id, SUM(u.broj_casova)::int AS ukupno
    FROM uplate u
    JOIN deca d ON d.client_id = u.client_id
    GROUP BY u.client_id, u.term_type_id
  )
  SELECT COALESCE(jsonb_object_agg(k.id, jsonb_build_array(k.redni, COALESCE(pl.ukupno, 0))), '{}'::jsonb)
  FROM casovi k
  LEFT JOIN placeno pl
    ON pl.client_id = k.client_id
   AND pl.term_type_id IS NOT DISTINCT FROM k.term_type_id
  WHERE k.date BETWEEN p_from AND p_to;
$$;

-- Samo server (service role) – ne otvara se ka anon/ulogovanim korisnicima.
REVOKE ALL ON FUNCTION public.redni_broj_casova(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redni_broj_casova(DATE, DATE) TO service_role;

-- Nova uplata menja "y" na kalendaru – ako je migracija 045 (automatsko osvežavanje) pokrenuta,
-- i uplate javljaju otvorenim kalendarima da se osveže.
DO $$
BEGIN
  IF to_regprocedure('public.obavesti_kalendar()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS obavesti_kalendar_ins_del ON public.uplate;
    DROP TRIGGER IF EXISTS obavesti_kalendar_upd ON public.uplate;
    CREATE TRIGGER obavesti_kalendar_ins_del AFTER INSERT OR DELETE ON public.uplate
      FOR EACH ROW EXECUTE FUNCTION public.obavesti_kalendar();
    CREATE TRIGGER obavesti_kalendar_upd AFTER UPDATE ON public.uplate
      FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.obavesti_kalendar();
  END IF;
END $$;
