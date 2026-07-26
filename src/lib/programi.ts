/** Skida srpsku dijakritiku i menja u mala slova, za labavo poređenje naziva. */
function normalizeNaziv(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/đ/g, 'dj')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z');
}

/** Id programa „Čitanje“ ako postoji u listi – za default-čekiranje pri unosu novog klijenta. */
export function findDefaultCitanjeProgramId(programs: { id: string; naziv: string }[]): string | null {
  const match = programs.find((p) => normalizeNaziv(p.naziv) === 'citanje');
  return match?.id ?? null;
}
