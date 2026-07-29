-- Dodatni indeksi za često pogađane upite koji ih do sad nisu imali.

-- syncSpilloverSlots/ForTerm, deletePredavanjeAsAdmin, deleteTermAsAdmin, deleteTermAsInstructor,
-- reassignPredavanjeInstructorAsAdmin i swap_terms (preko syncSpilloverForTerm) svi traže decu
-- dvočas bloka preko nastavak_of_term_id – pogađa se pri skoro svakoj izmeni/brisanju termina.
CREATE INDEX IF NOT EXISTS idx_terms_nastavak_of_term_id
  ON terms(nastavak_of_term_id)
  WHERE nastavak_of_term_id IS NOT NULL;

-- Join sa term_categories (is_testing prikaz) na kalendaru i drugde.
CREATE INDEX IF NOT EXISTS idx_terms_term_category_id ON terms(term_category_id);

-- getAllClientsCompletedProgramIds() se poziva na svakom učitavanju forme za dodavanje/izmenu
-- radionice (admin i dashboard) – filtrira SAMO zavrseno=true redove, pa parcijalni indeks
-- pokriva tačno taj upit (i čini ga index-only scan-om).
CREATE INDEX IF NOT EXISTS idx_client_programi_completed
  ON client_programi(client_id, program_id)
  WHERE zavrseno = true;

-- Kalendar učitava potential_clients ugnježdeno po terminu (testiranje) preko term_id.
CREATE INDEX IF NOT EXISTS idx_potential_clients_term_id
  ON potential_clients(term_id)
  WHERE term_id IS NOT NULL;

-- Skoro svaka lista klijenata (picker-i, Admin → Klijenti, forma za uplatu...) sortira po
-- imenu pa prezimenu (ili obrnuto) – bez indeksa je to sort posle seq scan-a na svakom load-u.
CREATE INDEX IF NOT EXISTS idx_clients_ime_prezime ON clients(ime, prezime);
