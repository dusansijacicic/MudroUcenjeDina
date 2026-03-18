-- Podešavanje: maksimalan broj termina (predavač+učionica) u jednom vremenskom slotu
INSERT INTO app_settings (key, value) VALUES ('max_termina_po_slotu', '4')
ON CONFLICT (key) DO NOTHING;
