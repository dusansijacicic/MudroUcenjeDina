-- Popravka podataka: dete upisano u „Nastavak dužeg časa“ drugog časa.
--
-- Ranije je dodela instruktora (ili zakazivanje) u vreme kada taj instruktor ima automatski nastavak
-- svog dužeg časa ubacivala dete baš u taj nastavak. Takav red se kasnije, pri svakom usklađivanju
-- nastavaka (izmena, premeštanje, otkazivanje dužeg časa, promena učionice), brisao kao „nastavak“ –
-- zajedno sa detetom („čas je nestao“). Aplikacija to od sada ne dozvoljava; ovde se postojeći takvi
-- redovi pretvaraju u obične časove, da ih ništa više ne briše.
--
-- Duži čas čiji je nastavak tako zauzet ostaje bez nastavka u tom bloku (instruktor ima dva časa u isto
-- vreme). Spisak takvih časova daje dugme „Obnovi nastavke dužih časova“ (Vrste časova).

UPDATE terms t
SET nastavak_of_term_id = NULL,
    napomena = NULL
WHERE t.napomena = 'Automatski zauzeto (nastavak dužeg časa)'
  AND EXISTS (SELECT 1 FROM predavanja p WHERE p.term_id = t.id);
