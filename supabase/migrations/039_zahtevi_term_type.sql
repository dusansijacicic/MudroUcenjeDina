-- Omogućava da se pri kreiranju zahteva (npr. masovno zakazivanje bez instruktora, iz admin panela)
-- unapred zabeleži željena vrsta časa, koja se prenosi u predavanja kad predavač potvrdi zahtev.
ALTER TABLE zahtevi_za_cas ADD COLUMN IF NOT EXISTS term_type_id UUID REFERENCES term_types(id) ON DELETE SET NULL;
