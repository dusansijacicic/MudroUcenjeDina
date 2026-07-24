-- Indeksi za ubrzanje kalendara: filtriranje termina/otkazanih termina po datumskom opsegu
-- (idx_terms_instructor_date pomaže samo kad se filtrira i po instructor_id).

CREATE INDEX IF NOT EXISTS idx_terms_date ON terms(date);
CREATE INDEX IF NOT EXISTS idx_otkazani_termini_term_date ON otkazani_termini(term_date);
