export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Instructor {
  id: string;
  user_id: string;
  ime: string;
  prezime: string;
  email: string;
  telefon: string | null;
  color: string | null; // hex npr. #EAB308 za prikaz u kalendaru
  created_at: string;
}

export interface Client {
  id: string;
  user_id: string | null;
  login_email: string | null; // email za prijavu učenika (povezuje nalog sa klijentom)
  ime: string;
  prezime: string;
  /** Pol učenika: muski / zenski; opciono. */
  pol?: string | null;
  godiste: number | null;
  razred: string | null;
  skola: string | null;
  roditelj: string | null;
  kontakt_telefon: string | null;
  /** Interna napomena (admin / instruktor). */
  napomena?: string | null;
  /** Popust u % za ovog klijenta (0–100). Dodeljuje super admin. */
  popust_percent?: number | null;
  /** Datum testiranja / upisa (opciono); lista klijenata sortira se po ovom datumu. */
  datum_testiranja?: string | null;
  created_at: string;
}

/** Kategorija termina (tabela term_categories; admin CRUD). */
export interface TermCategory {
  id: string;
  naziv: string;
  opis: string | null;
  jedan_klijent_po_terminu: boolean;
  created_at?: string;
}

/** Veza predavač–klijent (jedno dete može imati više predavača). placeno_casova je po ovoj vezi. */
export interface InstructorClient {
  instructor_id: string;
  client_id: string;
  placeno_casova: number;
}

/** Termin = jedan slot (datum + vreme). Može imati više predavanja. */
export interface Term {
  id: string;
  instructor_id: string;
  date: string;
  slot_index: number;
  term_category_id?: string;
  /** Kada se učitava sa join-om */
  term_categories?: TermCategory | TermCategory[] | null;
  napomena?: string | null;
  created_at?: string;
}

/** Jedno predavanje (čas) unutar termina – jedan klijent, održano/plaćeno, komentar. */
export interface Predavanje {
  id: string;
  term_id: string;
  client_id: string;
  odrzano: boolean;
  placeno: boolean;
  komentar: string | null;
  created_at: string;
}

export interface TermWithPredavanja extends Term {
  predavanja?: (Predavanje & { client?: Client | null })[];
}

export interface PredavanjeWithRelations extends Predavanje {
  term?: Term | null;
  client?: Client | null;
}

/** Zahtev klijenta za zakazivanje časa. instructor_id null = bilo koji predavač. */
export interface ZahtevZaCas {
  id: string;
  client_id: string;
  instructor_id: string | null;
  requested_date: string;
  requested_slot_index: number;
  status: 'pending' | 'confirmed' | 'changed' | 'rejected';
  resolved_at: string | null;
  resolved_by: string | null;
  created_term_id: string | null;
  created_predavanje_id: string | null;
  note_from_instructor: string | null;
  created_at: string;
}
