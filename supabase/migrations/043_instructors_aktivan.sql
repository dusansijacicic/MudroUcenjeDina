-- "Suspendovan" instruktor: i dalje postoji (istorija termina/uplata ostaje netaknuta), samo se ne
-- nudi u listama za dodelu NOVOG posla (zakazivanje, dodela instruktora/učionice, nova uplata).
-- DEFAULT true pokriva i postojeće redove (svi ostaju aktivni) i buduće unose bez dodatne izmene koda.
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS aktivan BOOLEAN NOT NULL DEFAULT true;
