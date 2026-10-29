/** Pretraga bez obzira na velika slova i kvačice: "dorde", "djordje" i "Đorđe" nalaze isto. */
export function searchVariants(text: string): string[] {
  const base = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return [base.replace(/đ/g, 'd'), base.replace(/đ/g, 'dj')];
}

/** Da li tekst (već pretvoren preko searchVariants) sadrži upit u bilo kom obliku. */
export function variantsMatch(haystack: string[], query: string): boolean {
  const q = searchVariants(query.trim());
  return haystack.some((h) => q.some((v) => h.includes(v)));
}
