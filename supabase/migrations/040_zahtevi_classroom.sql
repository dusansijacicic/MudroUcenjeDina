-- Omogućava da se učionica dodeli zahtevu (zahtevi_za_cas) NEZAVISNO od redosleda – i pre nego što
-- dobije instruktora. Kad se zahtev potvrdi (bilo od strane admina ili predavača), ova učionica se
-- prenosi na kreirani termin.
ALTER TABLE zahtevi_za_cas ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL;
