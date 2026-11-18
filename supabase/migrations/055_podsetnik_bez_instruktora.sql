-- Podsetnik „termini bez instruktora/učionice“ (žuta traka na kalendaru): admin može da ukloni datum
-- iz trake (✕ uz datum, uz potvrdu). Časovi ostaju na kalendaru – skriva se samo podsetnik za njih.
-- Nov čas bez instruktora tog dana ima false, pa se datum ponovo pojavi u traci.
ALTER TABLE zahtevi_za_cas ADD COLUMN IF NOT EXISTS podsetnik_skriven BOOLEAN NOT NULL DEFAULT false;
