-- Plaćeno testiranje: dete sa testiranja nije klijent (nema pakete časova), pa se plaćanje pamti na
-- samom detetu. Označava se na kalendaru (Označi plaćeno → klik na dete u terminu testiranja) ili na
-- stranici Testiranja / u terminu (dugme „Označi plaćeno“).
ALTER TABLE potential_clients ADD COLUMN IF NOT EXISTS placeno BOOLEAN NOT NULL DEFAULT false;
