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
 * Id vrste termina „12-Čitanje“ (čitanje po paketskoj ceni, najčešći prvi izbor) ako postoji u listi –
 * za default-čekiranje pri unosu novog klijenta. Ako ta konkretna (12-) varijanta ne postoji, vraća
 * bilo koju vrstu sa „čitanje“ u nazivu; vraća null ako ni to ne postoji.
 */
export function findDefaultCitanjeTermTypeId(termTypes: { id: string; naziv: string }[]): string | null {
  const paketska = termTypes.find((tt) => {
    const n = normalizeNaziv(tt.naziv);
    return n.startsWith('12') && n.includes('citanje');
  });
  if (paketska) return paketska.id;
  const anyCitanje = termTypes.find((tt) => normalizeNaziv(tt.naziv).includes('citanje'));
  return anyCitanje?.id ?? null;
}
