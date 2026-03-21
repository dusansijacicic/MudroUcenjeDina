-- Opciono: pri registraciji učenik može uneti datum testiranja (ne menja postojeći datum ako ostavi prazno).
DROP FUNCTION IF EXISTS public.link_client_to_user();
DROP FUNCTION IF EXISTS public.link_client_to_user(date);

CREATE OR REPLACE FUNCTION public.link_client_to_user(p_datum_testiranja date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  UPDATE public.clients
  SET
    user_id = auth.uid(),
    datum_testiranja = CASE
      WHEN p_datum_testiranja IS NOT NULL THEN p_datum_testiranja
      ELSE datum_testiranja
    END
  WHERE login_email = user_email AND (user_id IS NULL OR user_id = auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_client_to_user(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_client_to_user(date) TO service_role;
