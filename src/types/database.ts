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
  instructor_id: string;
  user_id: string | null;
  login_email: string | null; // email za prijavu učenika (povezuje nalog sa klijentom)
  ime: string;
  prezime: string;
  godiste: number | null;
  razred: string | null;
  skola: string | null;
  roditelj: string | null;
  kontakt_telefon: string | null;
  placeno_casova: number;
  created_at: string;
}

/** Termin = jedan slot (datum + vreme). Može imati više predavanja. */
export interface Term {
  id: string;
  instructor_id: string;
  date: string;
  slot_index: number;
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
