/** Skida srpsku dijakritiku i menja u mala slova, za labavo poređenje naziva. */
function normalizeNaziv(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/đ/g, 'dj')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z');
}

/**
 * Id vrste termina „11-Čitanje“ (najčešći prvi program) ako postoji u listi – za default-čekiranje
 * pri unosu novog klijenta. Vraća null ako takva vrsta ne postoji (admin je nije uneo / drugačije nazvana).
 */
export function findDefaultCitanjeTermTypeId(termTypes: { id: string; naziv: string }[]): string | null {
  const match = termTypes.find((tt) => normalizeNaziv(tt.naziv).includes('citanje'));
  return match?.id ?? null;
}
