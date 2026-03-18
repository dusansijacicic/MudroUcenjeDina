-- Prekida infinite recursion u RLS (clients <-> instructor_clients <-> instructors).
-- Pomocne funkcije rade kao SECURITY DEFINER pa ne triggeruju RLS pri citanju.

-- 1) ID trenutnog predavaca (jedan) ili prazno
CREATE OR REPLACE FUNCTION public.current_user_instructor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1; $$;

-- 2) ID trenutnog klijenta (ucenika) ili null
CREATE OR REPLACE FUNCTION public.current_user_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM clients WHERE user_id = auth.uid() LIMIT 1; $$;

-- 3) ID-jevi klijenata povezanih sa trenutnim predavacem (bez RLS rekurzije)
CREATE OR REPLACE FUNCTION public.linked_client_ids_for_current_instructor()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT client_id FROM instructor_clients WHERE instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1); $$;

-- 4) ID-jevi predavaca povezanih sa trenutnim klijentom (bez RLS rekurzije)
CREATE OR REPLACE FUNCTION public.linked_instructor_ids_for_current_client()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT instructor_id FROM instructor_clients WHERE client_id = (SELECT id FROM clients WHERE user_id = auth.uid() LIMIT 1); $$;

-- Da bi SECURITY DEFINER zaobisao RLS, vlasnik mora imati BYPASSRLS (npr. postgres).
DO $$
BEGIN
  ALTER FUNCTION public.current_user_instructor_id() OWNER TO postgres;
  ALTER FUNCTION public.current_user_client_id() OWNER TO postgres;
  ALTER FUNCTION public.linked_client_ids_for_current_instructor() OWNER TO postgres;
  ALTER FUNCTION public.linked_instructor_ids_for_current_client() OWNER TO postgres;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ALTER OWNER nije uspeo. RLS rekurzija može ostati. %', SQLERRM;
END $$;

GRANT EXECUTE ON FUNCTION public.current_user_instructor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.linked_client_ids_for_current_instructor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.linked_instructor_ids_for_current_client() TO authenticated;

-- Ukloni stare politike koje izazivaju rekurziju i zameni ih verzijama sa funkcijama

-- instructors
DROP POLICY IF EXISTS "Clients read instructors for own predavanja" ON instructors;
DROP POLICY IF EXISTS "Clients read linked instructors" ON instructors;
CREATE POLICY "Clients read instructors for own predavanja" ON instructors FOR SELECT USING (
  id IN (SELECT instructor_id FROM terms WHERE id IN (SELECT term_id FROM predavanja WHERE client_id = (SELECT current_user_client_id())))
);
CREATE POLICY "Clients read linked instructors" ON instructors FOR SELECT USING (
  id IN (SELECT linked_instructor_ids_for_current_client())
);

-- clients
DROP POLICY IF EXISTS "Instructors see linked clients" ON clients;
DROP POLICY IF EXISTS "Instructors update linked clients" ON clients;
CREATE POLICY "Instructors see linked clients" ON clients FOR SELECT USING (
  id IN (SELECT linked_client_ids_for_current_instructor())
);
CREATE POLICY "Instructors update linked clients" ON clients FOR UPDATE USING (
  id IN (SELECT linked_client_ids_for_current_instructor())
);

-- instructor_clients
DROP POLICY IF EXISTS "Instructors own instructor_clients" ON instructor_clients;
DROP POLICY IF EXISTS "Instructors insert instructor_clients" ON instructor_clients;
DROP POLICY IF EXISTS "Instructors update instructor_clients" ON instructor_clients;
DROP POLICY IF EXISTS "Clients read own instructor_clients" ON instructor_clients;
CREATE POLICY "Instructors own instructor_clients" ON instructor_clients FOR ALL USING (
  instructor_id = (SELECT current_user_instructor_id())
);
CREATE POLICY "Instructors insert instructor_clients" ON instructor_clients FOR INSERT WITH CHECK (
  instructor_id = (SELECT current_user_instructor_id())
);
CREATE POLICY "Instructors update instructor_clients" ON instructor_clients FOR UPDATE USING (
  instructor_id = (SELECT current_user_instructor_id())
);
CREATE POLICY "Clients read own instructor_clients" ON instructor_clients FOR SELECT USING (
  client_id = (SELECT current_user_client_id())
);

-- terms (Clients read terms) – koristi funkciju da izbegne rekurziju
DROP POLICY IF EXISTS "Clients read terms for own predavanja" ON terms;
CREATE POLICY "Clients read terms for own predavanja" ON terms FOR SELECT USING (
  id IN (SELECT term_id FROM predavanja WHERE client_id = (SELECT current_user_client_id()))
);

-- predavanja (Clients read own)
DROP POLICY IF EXISTS "Clients read own predavanja" ON predavanja;
CREATE POLICY "Clients read own predavanja" ON predavanja FOR SELECT USING (
  client_id = (SELECT current_user_client_id())
);

-- terms (Instructors own) – koristi funkciju
DROP POLICY IF EXISTS "Instructors own terms" ON terms;
CREATE POLICY "Instructors own terms" ON terms FOR ALL USING (
  instructor_id = (SELECT current_user_instructor_id())
);

-- predavanja (Instructors own)
DROP POLICY IF EXISTS "Instructors own predavanja" ON predavanja;
CREATE POLICY "Instructors own predavanja" ON predavanja FOR ALL USING (
  term_id IN (SELECT id FROM terms WHERE instructor_id = (SELECT current_user_instructor_id()))
);

-- zahtevi_za_cas – Clients i Instructors politike
DROP POLICY IF EXISTS "Clients read own zahtevi" ON zahtevi_za_cas;
DROP POLICY IF EXISTS "Clients insert own zahtevi" ON zahtevi_za_cas;
DROP POLICY IF EXISTS "Instructors read zahtevi" ON zahtevi_za_cas;
DROP POLICY IF EXISTS "Instructors update zahtevi" ON zahtevi_za_cas;
CREATE POLICY "Clients read own zahtevi" ON zahtevi_za_cas FOR SELECT USING (
  client_id = (SELECT current_user_client_id())
);
CREATE POLICY "Clients insert own zahtevi" ON zahtevi_za_cas FOR INSERT WITH CHECK (
  client_id = (SELECT current_user_client_id())
);
CREATE POLICY "Instructors read zahtevi" ON zahtevi_za_cas FOR SELECT USING (
  instructor_id = (SELECT current_user_instructor_id())
  OR (instructor_id IS NULL AND client_id IN (SELECT client_id FROM instructor_clients WHERE instructor_id = (SELECT current_user_instructor_id())))
);
CREATE POLICY "Instructors update zahtevi" ON zahtevi_za_cas FOR UPDATE USING (
  instructor_id = (SELECT current_user_instructor_id())
  OR (instructor_id IS NULL AND client_id IN (SELECT client_id FROM instructor_clients WHERE instructor_id = (SELECT current_user_instructor_id())))
);

-- instructor_weekly_availability
DROP POLICY IF EXISTS "Instructors manage own weekly availability" ON instructor_weekly_availability;
DROP POLICY IF EXISTS "Clients can read instructor availability" ON instructor_weekly_availability;
CREATE POLICY "Instructors manage own weekly availability" ON instructor_weekly_availability FOR ALL USING (
  instructor_id = (SELECT current_user_instructor_id())
);
CREATE POLICY "Clients can read instructor availability" ON instructor_weekly_availability FOR SELECT USING (
  instructor_id IN (SELECT linked_instructor_ids_for_current_client())
);

-- instructor_availability_periods
DROP POLICY IF EXISTS "Instructors manage own availability periods" ON instructor_availability_periods;
DROP POLICY IF EXISTS "Clients can read instructor availability periods" ON instructor_availability_periods;
CREATE POLICY "Instructors manage own availability periods" ON instructor_availability_periods FOR ALL USING (
  instructor_id = (SELECT current_user_instructor_id())
);
CREATE POLICY "Clients can read instructor availability periods" ON instructor_availability_periods FOR SELECT USING (
  instructor_id IN (SELECT linked_instructor_ids_for_current_client())
);

-- Instructors can read all terms / predavanja – koristi funkciju
DROP POLICY IF EXISTS "Instructors can read all terms" ON terms;
DROP POLICY IF EXISTS "Instructors can read all predavanja" ON predavanja;
CREATE POLICY "Instructors can read all terms" ON terms FOR SELECT USING (
  (SELECT current_user_instructor_id()) IS NOT NULL
);
CREATE POLICY "Instructors can read all predavanja" ON predavanja FOR SELECT USING (
  (SELECT current_user_instructor_id()) IS NOT NULL
);
