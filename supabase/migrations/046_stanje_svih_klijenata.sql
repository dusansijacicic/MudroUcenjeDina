-- Brza lista klijenata: kupljeno / održano po klijentu i vrsti časa sabira baza, pa aplikacija dobija
-- jedan mali odgovor umesto hiljada redova predavanja (i bez limita od 1000 redova po upitu).
-- Održano = označeno kao održano ILI je vreme termina prošlo (isto pravilo koje aplikacija primenjuje
-- kad otvori profil klijenta). Termini kategorije NASTAVAK se ne računaju, kao ni u aplikaciji.
-- Slotovi su po 45 min od 09:00, pa je kraj slota N = 09:00 + (N + 1) * 45 min (po beogradskom vremenu).

CREATE OR REPLACE FUNCTION public.stanje_svih_klijenata()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_array(client_id, term_type_id, uplaceno, odrzano)), '[]'::jsonb)
  FROM (
    SELECT client_id, term_type_id, SUM(uplaceno)::int AS uplaceno, SUM(odrzano)::int AS odrzano
    FROM (
      SELECT u.client_id, u.term_type_id, u.broj_casova AS uplaceno, 0 AS odrzano
      FROM uplate u
      UNION ALL
      SELECT p.client_id, p.term_type_id, 0, 1
      FROM predavanja p
      JOIN terms t ON t.id = p.term_id
      LEFT JOIN term_categories c ON c.id = t.term_category_id
      WHERE COALESCE(c.is_nastavak, false) = false
        AND (
          p.odrzano
          OR t.date + time '09:00' + (t.slot_index + 1) * interval '45 minutes' < (now() AT TIME ZONE 'Europe/Belgrade')
        )
    ) s
    GROUP BY client_id, term_type_id
  ) x;
$$;

-- Samo server (service role) – ne otvara se ka anon/ulogovanim korisnicima.
REVOKE ALL ON FUNCTION public.stanje_svih_klijenata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stanje_svih_klijenata() TO service_role;
