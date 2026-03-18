-- =============================================================================
-- DINA KALENDAR – POTPUNI RESET I KREIRANJE ŠEME (sve migracije u jednom)
-- =============================================================================
-- Uputstvo: Nalepi ceo fajl u Supabase SQL Editor i pokreni RUN.
-- Briše i sve auth korisnike (Authentication → Users će biti prazan).
-- Zatim: Authentication → Users → Add user (dusan, dina, nekodete, lozinka 123456).
-- Zatim pokreni seed_mock_data.sql u SQL Editoru.
--
-- Šema: tabele, RLS (admin + predavač mogu dodavati klijente; predavač vidi/menja svoje),
-- funkcije (link_client_to_user, get_occupied_slots, get_instructor_available_slots).
-- =============================================================================

-- ----- 1. RUŠENJE PUBLIC TABELA I FUNKCIJA -----
DROP FUNCTION IF EXISTS public.get_instructor_available_slots(uuid, date);
DROP FUNCTION IF EXISTS public.get_occupied_slots(date);
DROP FUNCTION IF EXISTS public.link_client_to_user();

DROP TABLE IF EXISTS instructor_availability_periods CASCADE;
DROP TABLE IF EXISTS instructor_weekly_availability CASCADE;
DROP TABLE IF EXISTS zahtevi_za_cas CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS predavanja CASCADE;
DROP TABLE IF EXISTS terms CASCADE;
DROP TABLE IF EXISTS instructor_clients CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS instructors CASCADE;

-- ----- 1b. BRIŠI SVE AUTH KORISNIKE (Supabase Authentication) -----
-- Mora posle DROP public tabela jer su instructors/clients imali FK na auth.users
DELETE FROM auth.sessions;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.identities;
DELETE FROM auth.users;

-- ----- 2. TABELE -----

-- Predavači (povezani sa auth.users)
CREATE TABLE instructors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ime TEXT NOT NULL,
  prezime TEXT NOT NULL,
  email TEXT NOT NULL,
  telefon TEXT,
  color TEXT DEFAULT '#EAB308',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Klijenti (učenici) – bez instructor_id (veza preko instructor_clients)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  login_email TEXT UNIQUE,
  ime TEXT NOT NULL,
  prezime TEXT NOT NULL,
  godiste INT,
  razred TEXT,
  skola TEXT,
  roditelj TEXT,
  kontakt_telefon TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Veza predavač–klijent (many-to-many), placeno_casova po vezi
CREATE TABLE instructor_clients (
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  placeno_casova INT NOT NULL DEFAULT 0,
  PRIMARY KEY (instructor_id, client_id)
);

-- Termini (jedan slot na dan, bez client_id – više predavanja mogu biti u istom terminu)
CREATE TABLE terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  slot_index SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index <= 12),
  UNIQUE(instructor_id, date, slot_index)
);

-- Predavanja (jedan čas = jedan termín + jedan klijent)
CREATE TABLE predavanja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  odrzano BOOLEAN NOT NULL DEFAULT false,
  placeno BOOLEAN NOT NULL DEFAULT false,
  komentar TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Super admin
CREATE TABLE admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Podešavanja aplikacije (max časova po terminu itd.)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO app_settings (key, value) VALUES ('max_casova_po_terminu', '4') ON CONFLICT (key) DO NOTHING;

-- Zahtevi za čas (klijent zatraži, predavač potvrdi/promeni/odbije)
CREATE TABLE zahtevi_za_cas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
  requested_date DATE NOT NULL,
  requested_slot_index SMALLINT NOT NULL CHECK (requested_slot_index >= 0 AND requested_slot_index <= 12),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'changed', 'rejected')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES instructors(id) ON DELETE SET NULL,
  created_term_id UUID REFERENCES terms(id) ON DELETE SET NULL,
  created_predavanje_id UUID REFERENCES predavanja(id) ON DELETE SET NULL,
  note_from_instructor TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Dostupnost predavača (nedeljni raspored)
CREATE TABLE instructor_weekly_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  slot_index SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index <= 12),
  UNIQUE(instructor_id, day_of_week, slot_index)
);

-- Dostupnost po periodu (override)
CREATE TABLE instructor_availability_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL CHECK (date_to >= date_from),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  slot_index SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index <= 12),
  UNIQUE(instructor_id, date_from, date_to, day_of_week, slot_index)
);

-- ----- 3. INDEKSI -----
CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_instructor_clients_instructor ON instructor_clients(instructor_id);
CREATE INDEX idx_instructor_clients_client ON instructor_clients(client_id);
CREATE INDEX idx_terms_instructor_date ON terms(instructor_id, date);
CREATE INDEX idx_predavanja_term ON predavanja(term_id);
CREATE INDEX idx_predavanja_client ON predavanja(client_id);
CREATE INDEX idx_zahtevi_client ON zahtevi_za_cas(client_id);
CREATE INDEX idx_zahtevi_instructor ON zahtevi_za_cas(instructor_id);
CREATE INDEX idx_zahtevi_status ON zahtevi_za_cas(status);
CREATE INDEX idx_instructor_weekly_availability_instructor ON instructor_weekly_availability(instructor_id);
CREATE INDEX idx_instructor_availability_periods_instructor ON instructor_availability_periods(instructor_id);
CREATE INDEX idx_instructor_availability_periods_dates ON instructor_availability_periods(instructor_id, date_from, date_to);

-- ----- 4. RLS I POLITIKE -----

ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE predavanja ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE zahtevi_za_cas ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_weekly_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_availability_periods ENABLE ROW LEVEL SECURITY;

-- Instructors
CREATE POLICY "Instructors own row" ON instructors FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own instructor row" ON instructors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins full access instructors" ON instructors FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users));
CREATE POLICY "Instructors can read all terms" ON terms FOR SELECT USING (auth.uid() IN (SELECT user_id FROM instructors));
CREATE POLICY "Instructors can read all predavanja" ON predavanja FOR SELECT USING (auth.uid() IN (SELECT user_id FROM instructors));
CREATE POLICY "Clients read terms for own predavanja" ON terms FOR SELECT USING (
  id IN (SELECT term_id FROM predavanja WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()))
);
CREATE POLICY "Clients read instructors for own predavanja" ON instructors FOR SELECT USING (
  id IN (SELECT instructor_id FROM terms WHERE id IN (SELECT term_id FROM predavanja WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())))
);
CREATE POLICY "Clients read linked instructors" ON instructors FOR SELECT USING (
  id IN (SELECT instructor_id FROM instructor_clients WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()))
);

-- Clients
CREATE POLICY "Instructors see linked clients" ON clients FOR SELECT USING (
  id IN (SELECT client_id FROM instructor_clients WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid()))
);
CREATE POLICY "Instructors update linked clients" ON clients FOR UPDATE USING (
  id IN (SELECT client_id FROM instructor_clients WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid()))
);
CREATE POLICY "Instructors or admin insert clients" ON clients FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM instructors) OR auth.uid() IN (SELECT user_id FROM admin_users)
);
CREATE POLICY "Clients read own row" ON clients FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins full access clients" ON clients FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- instructor_clients (predavač može da dodaje i menja svoje veze)
CREATE POLICY "Instructors own instructor_clients" ON instructor_clients FOR ALL USING (
  instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
);
CREATE POLICY "Instructors insert instructor_clients" ON instructor_clients FOR INSERT WITH CHECK (
  instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
);
CREATE POLICY "Instructors update instructor_clients" ON instructor_clients FOR UPDATE USING (
  instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
);
CREATE POLICY "Clients read own instructor_clients" ON instructor_clients FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
CREATE POLICY "Admins full access instructor_clients" ON instructor_clients FOR ALL USING (
  auth.uid() IN (SELECT user_id FROM admin_users)
);

-- terms
CREATE POLICY "Instructors own terms" ON terms FOR ALL USING (
  instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
);
CREATE POLICY "Admins full access terms" ON terms FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- predavanja
CREATE POLICY "Instructors own predavanja" ON predavanja FOR ALL USING (
  term_id IN (SELECT id FROM terms WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid()))
);
CREATE POLICY "Clients read own predavanja" ON predavanja FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
CREATE POLICY "Admins full access predavanja" ON predavanja FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- admin_users
CREATE POLICY "Users can read own admin row" ON admin_users FOR SELECT USING (user_id = auth.uid());

-- app_settings
CREATE POLICY "Authenticated read app_settings" ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin update app_settings" ON app_settings FOR ALL TO authenticated USING (
  auth.uid() IN (SELECT user_id FROM admin_users)
) WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

-- zahtevi_za_cas
CREATE POLICY "Clients read own zahtevi" ON zahtevi_za_cas FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
CREATE POLICY "Clients insert own zahtevi" ON zahtevi_za_cas FOR INSERT WITH CHECK (
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
);
CREATE POLICY "Instructors read zahtevi" ON zahtevi_za_cas FOR SELECT USING (
  instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1)
  OR (instructor_id IS NULL AND client_id IN (
    SELECT client_id FROM instructor_clients WHERE instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1)
  ))
);
CREATE POLICY "Instructors update zahtevi" ON zahtevi_za_cas FOR UPDATE USING (
  instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1)
  OR (instructor_id IS NULL AND client_id IN (
    SELECT client_id FROM instructor_clients WHERE instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid() LIMIT 1)
  ))
);
CREATE POLICY "Admins full access zahtevi" ON zahtevi_za_cas FOR ALL USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- instructor_weekly_availability
CREATE POLICY "Instructors manage own weekly availability" ON instructor_weekly_availability FOR ALL USING (
  instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
);
CREATE POLICY "Clients can read instructor availability" ON instructor_weekly_availability FOR SELECT USING (
  instructor_id IN (
    SELECT ic.instructor_id FROM instructor_clients ic
    JOIN clients c ON c.id = ic.client_id
    WHERE c.user_id = auth.uid()
  )
);

-- instructor_availability_periods
CREATE POLICY "Instructors manage own availability periods" ON instructor_availability_periods FOR ALL USING (
  instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
);
CREATE POLICY "Clients can read instructor availability periods" ON instructor_availability_periods FOR SELECT USING (
  instructor_id IN (
    SELECT ic.instructor_id FROM instructor_clients ic
    JOIN clients c ON c.id = ic.client_id
    WHERE c.user_id = auth.uid()
  )
);

-- ----- 5. FUNKCIJE -----

-- Povezivanje učenika (login_email -> user_id)
CREATE OR REPLACE FUNCTION public.link_client_to_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  UPDATE public.clients
  SET user_id = auth.uid()
  WHERE login_email = user_email AND (user_id IS NULL OR user_id = auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.link_client_to_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_client_to_user() TO service_role;

-- Zauzeti slotovi na dat datum (za klijentski zahtev)
CREATE OR REPLACE FUNCTION public.get_occupied_slots(p_date date)
RETURNS SETOF smallint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT t.slot_index
  FROM terms t
  WHERE t.date = p_date
    AND EXISTS (SELECT 1 FROM predavanja p WHERE p.term_id = t.id);
$$;
GRANT EXECUTE ON FUNCTION public.get_occupied_slots(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_occupied_slots(date) TO anon;

-- Dostupni slotovi za predavača na dat datum (nedeljni + period override)
CREATE OR REPLACE FUNCTION public.get_instructor_available_slots(p_instructor_id UUID, p_date DATE)
RETURNS SETOF smallint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH period_slots AS (
    SELECT slot_index FROM instructor_availability_periods
    WHERE instructor_id = p_instructor_id
      AND p_date BETWEEN date_from AND date_to
      AND day_of_week = EXTRACT(ISODOW FROM p_date)::smallint
  ),
  weekly_slots AS (
    SELECT slot_index FROM instructor_weekly_availability
    WHERE instructor_id = p_instructor_id
      AND day_of_week = EXTRACT(ISODOW FROM p_date)::smallint
  )
  SELECT DISTINCT slot_index FROM (
    SELECT slot_index FROM period_slots
    UNION ALL
    SELECT slot_index FROM weekly_slots
    WHERE NOT EXISTS (SELECT 1 FROM period_slots LIMIT 1)
  ) s
  ORDER BY slot_index;
$$;
GRANT EXECUTE ON FUNCTION public.get_instructor_available_slots(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_instructor_available_slots(uuid, date) TO anon;

-- =============================================================================
-- KRAJ – sada možeš pokrenuti seed_mock_data.sql
-- =============================================================================
