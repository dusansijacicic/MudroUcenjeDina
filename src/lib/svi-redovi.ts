/**
 * Supabase (PostgREST) vraća najviše 1000 redova po upitu, bez obzira na .limit(2000) – zato se lista
 * kojoj treba SVE (npr. sva deca) čita u delovima. Bez ovoga je, kad dece ima više od 1000, novo dete
 * „nestajalo“ iz liste (sačuvano je, ali iza 1000. reda po abecedi).
 *
 * Upit mora imati stabilan redosled (dodajte .order('id') na kraj) da se delovi ne preklapaju.
 */
const DEO = 500;

export async function sviRedovi<T>(
  upit: (od: number, doReda: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const sve: T[] = [];
  for (let od = 0; ; od += DEO) {
    const { data, error } = await upit(od, od + DEO - 1);
    if (error) {
      console.error('[sviRedovi]', error.message);
      break;
    }
    sve.push(...(data ?? []));
    if (!data || data.length < DEO) break;
  }
  return sve;
}
