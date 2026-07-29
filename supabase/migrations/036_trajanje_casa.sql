-- Trajanje vrste termina u minutima. Ako je duže od dužine jednog slota (45 min),
-- sistem automatski zauzima i naredni slot(ove) da niko drugi ne zakaže u njima
-- (koristi se postojeći terms.nastavak_of_term_id iz migracije 032, bez nove kolone).

ALTER TABLE term_types ADD COLUMN IF NOT EXISTS trajanje_minuta INTEGER NOT NULL DEFAULT 45;

COMMENT ON COLUMN term_types.trajanje_minuta IS
  'Trajanje časa u minutima. Ako je > dužina slota (45), automatski se zauzima i naredni slot (dvočas i sl.).';
