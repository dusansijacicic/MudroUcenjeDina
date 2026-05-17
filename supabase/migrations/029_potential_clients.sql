-- Proširujemo slot_index constraint sa <= 12 na <= 15 (dodati slotovi 18:45, 19:30, 20:15)
ALTER TABLE terms
  DROP CONSTRAINT IF EXISTS terms_slot_index_check,
  ADD CONSTRAINT terms_slot_index_check CHECK (slot_index >= 0 AND slot_index <= 15);

ALTER TABLE zahtevi_za_cas
  DROP CONSTRAINT IF EXISTS zahtevi_za_cas_requested_slot_index_check,
  ADD CONSTRAINT zahtevi_za_cas_requested_slot_index_check CHECK (requested_slot_index >= 0 AND requested_slot_index <= 15);

ALTER TABLE instructor_weekly_availability
  DROP CONSTRAINT IF EXISTS instructor_weekly_availability_slot_index_check,
  ADD CONSTRAINT instructor_weekly_availability_slot_index_check CHECK (slot_index >= 0 AND slot_index <= 15);

ALTER TABLE instructor_availability_periods
  DROP CONSTRAINT IF EXISTS instructor_availability_periods_slot_index_check,
  ADD CONSTRAINT instructor_availability_periods_slot_index_check CHECK (slot_index >= 0 AND slot_index <= 15);

-- Dodajemo is_testing flag na kategorije termina
ALTER TABLE term_categories ADD COLUMN IF NOT EXISTS is_testing BOOLEAN NOT NULL DEFAULT false;

-- Seeded kategorija za testiranje
INSERT INTO term_categories (id, naziv, opis, jedan_klijent_po_terminu, is_testing)
VALUES (
  'e8b4c5d0-1111-4a2a-9c3d-000000000003',
  'Testiranje',
  'Termin za testiranje potencijalnih novih klijenata',
  false,
  true
)
ON CONFLICT (id) DO UPDATE SET is_testing = true;

-- Tabela potencijalnih klijenata (iz termina testiranja)
CREATE TABLE IF NOT EXISTS potential_clients (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id          UUID        REFERENCES terms(id) ON DELETE SET NULL,
  ime              TEXT        NOT NULL DEFAULT '',
  ime_roditelja    TEXT,
  mobilni_roditelja TEXT,
  razred           TEXT,
  status           TEXT        NOT NULL DEFAULT 'zakazan',
    CONSTRAINT potential_clients_status_check
      CHECK (status IN ('zakazan', 'pojavio_se', 'nije_se_pojavio', 'prebacen_u_klijenta')),
  komentar         TEXT,
  converted_client_id UUID     REFERENCES clients(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE potential_clients ENABLE ROW LEVEL SECURITY;
-- Samo service role (admin klijent) može da pristupa ovoj tabeli
