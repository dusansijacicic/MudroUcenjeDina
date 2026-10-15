-- Ručni redosled programa (admin → Programi) – do sad se lista sortirala azbučno po nazivu, što
-- nije dozvoljavalo da se novi program ubaci TAČNO između dva postojeća (azbuka to ne dozvoljava).
-- Razmak od 10 između vrednosti ostavlja prostor da se kasnije ubaci još programa između bilo koja
-- dva postojeća, bez renumerisanja svih ostalih.
ALTER TABLE programi ADD COLUMN IF NOT EXISTS sort_order INTEGER;

UPDATE programi SET sort_order = 10 WHERE naziv = 'Čitanje';
UPDATE programi SET sort_order = 20 WHERE naziv = 'Defektološki tretman';
UPDATE programi SET sort_order = 25 WHERE naziv = 'Reedukacija psihomotorike';
UPDATE programi SET sort_order = 30 WHERE naziv = 'Logopedski tretman';
UPDATE programi SET sort_order = 40 WHERE naziv = 'Matematika';
UPDATE programi SET sort_order = 50 WHERE naziv = 'TTT';
UPDATE programi SET sort_order = 60 WHERE naziv = 'Učenje';

-- Bilo koji program koji ovde nije eksplicitno pomenut (nov, dodat posle ove migracije pre nego
-- što je pokrenuta) ide na kraj umesto da ostane NULL.
UPDATE programi
SET sort_order = (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM programi p2 WHERE p2.id <> programi.id)
WHERE sort_order IS NULL;
