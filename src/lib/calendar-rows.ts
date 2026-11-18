type CalendarPage<T> = { data: T[] | null; error: { message: string } | null };

/** REST vraća najviše jednu stranicu; ceo mesečni raspored može imati više redova. */
export async function readAllCalendarRows<T>(
  label: string,
  query: (from: number, to: number) => PromiseLike<CalendarPage<T>>
): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}
