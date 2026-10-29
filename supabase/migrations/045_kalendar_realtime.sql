-- Automatsko osvežavanje kalendara: posle svake izmene termina (i svega što se vidi na kalendaru)
-- baza pošalje kratku poruku "kalendar se promenio" na Realtime kanal 'kalendar'. Otvoreni kalendari
-- (admin i predavači) je čuju i povuku sveže podatke preko servera.
-- Poruka NE nosi podatke (samo naziv tabele), pa javni kanal ne otkriva ništa – sami termini se i dalje
-- čitaju samo preko servera uz proveru prava.

CREATE OR REPLACE FUNCTION public.obavesti_kalendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(jsonb_build_object('tabela', TG_TABLE_NAME), 'promena', 'kalendar', false);
  EXCEPTION WHEN OTHERS THEN
    -- Obaveštenje nikad ne sme da obori samu izmenu termina.
    NULL;
  END;
  RETURN NULL;
END;
$$;

-- Okidač po redu (ne po naredbi): UPDATE koji ništa ne promeni ne šalje poruku. Masovne izmene pošalju
-- više poruka, ali ih kalendar spoji u jedno osvežavanje.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['terms', 'predavanja', 'potential_clients', 'otkazani_termini', 'zahtevi_za_cas', 'blokirani_termini', 'uplate'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS obavesti_kalendar_ins_del ON public.%I', t);
      EXECUTE format('DROP TRIGGER IF EXISTS obavesti_kalendar_upd ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER obavesti_kalendar_ins_del AFTER INSERT OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.obavesti_kalendar()', t);
      EXECUTE format(
        'CREATE TRIGGER obavesti_kalendar_upd AFTER UPDATE ON public.%I '
        'FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.obavesti_kalendar()', t);
    END IF;
  END LOOP;
END $$;
