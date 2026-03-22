-- Pol pri registraciji / povezivanju + učenik menja svoj profil (pol, datum testiranja)

DROP FUNCTION IF EXISTS public.link_client_to_user(date);

CREATE OR REPLACE FUNCTION public.link_client_to_user(
  p_datum_testiranja date DEFAULT NULL,
  p_pol text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_email_norm text;
  pol_ok text;
BEGIN
  SELECT lower(trim(email)) INTO user_email_norm FROM auth.users WHERE id = auth.uid();
  IF user_email_norm IS NULL OR user_email_norm = '' THEN
    RETURN;
  END IF;

  pol_ok := NULL;
  IF p_pol IS NOT NULL AND trim(p_pol) <> '' THEN
    pol_ok := lower(trim(p_pol));
    IF pol_ok NOT IN ('muski', 'zenski') THEN
      pol_ok := NULL;
    END IF;
  END IF;

  UPDATE public.clients
  SET
    user_id = auth.uid(),
    datum_testiranja = CASE
      WHEN p_datum_testiranja IS NOT NULL THEN p_datum_testiranja
      ELSE datum_testiranja
    END,
    pol = CASE
      WHEN pol_ok IS NOT NULL THEN pol_ok
      ELSE pol
    END
  WHERE login_email IS NOT NULL
    AND lower(trim(login_email)) = user_email_norm
    AND (user_id IS NULL OR user_id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_client_to_user(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_client_to_user(date, text) TO service_role;

COMMENT ON FUNCTION public.link_client_to_user(date, text) IS 'Povezuje auth nalog sa clients redom po login_email; opciono postavlja datum testiranja i pol.';

-- Učenik ažurira pol i datum testiranja (samo svoj red)
CREATE OR REPLACE FUNCTION public.ucenik_update_own_profile(
  p_pol text DEFAULT NULL,
  p_datum_testiranja date DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pol_ok text;
BEGIN
  pol_ok := NULL;
  IF p_pol IS NOT NULL AND trim(p_pol) <> '' THEN
    pol_ok := lower(trim(p_pol));
    IF pol_ok NOT IN ('muski', 'zenski') THEN
      pol_ok := NULL;
    END IF;
  END IF;

  UPDATE public.clients
  SET
    pol = pol_ok,
    datum_testiranja = p_datum_testiranja
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ucenik_update_own_profile(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ucenik_update_own_profile(text, date) TO service_role;

COMMENT ON FUNCTION public.ucenik_update_own_profile(text, date) IS 'Učenik menja svoj pol i datum testiranja (NULL = obriši datum).';
