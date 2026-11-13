-- Uvoz rasporeda (Admin → Uvoz rasporeda): pamti koje ime sa papira je koje dete.
-- Kad se jednom izabere da je "Lena K." = Lena Kostić, sledeći uvoz to sam ponudi.
-- ime_sa_papira je normalizovano (mala slova, bez dijakritike i tačaka), npr. "lena k".

CREATE TABLE IF NOT EXISTS uvoz_imena (
  ime_sa_papira TEXT PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pristupa samo server (service role) – bez polisa za korisnike.
ALTER TABLE uvoz_imena ENABLE ROW LEVEL SECURITY;
