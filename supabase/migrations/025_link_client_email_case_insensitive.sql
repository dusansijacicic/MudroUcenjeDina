-- Učenik: prijava i kada login_email u bazi i email u auth.users nisu isti case (npr. User@Gmail.com vs user@gmail.com)
CREATE OR REPLACE FUNCTION public.link_client_to_user(p_datum_testiranja date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_email_norm text;
BEGIN
  SELECT lower(trim(email)) INTO user_email_norm FROM auth.users WHERE id = auth.uid();
  IF user_email_norm IS NULL OR user_email_norm = '' THEN
    RETURN;
  END IF;

  UPDATE public.clients
  SET
    user_id = auth.uid(),
    datum_testiranja = CASE
      WHEN p_datum_testiranja IS NOT NULL THEN p_datum_testiranja
      ELSE datum_testiranja
    END
  WHERE login_email IS NOT NULL
    AND lower(trim(login_email)) = user_email_norm
    AND (user_id IS NULL OR user_id = auth.uid());
END;
$$;
