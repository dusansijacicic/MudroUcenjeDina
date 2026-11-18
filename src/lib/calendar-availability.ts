/** Početna vremena koja se preklapaju sa časovima izabrane dece, uključujući nastavke. */
export function unavailableCalendarStarts(
  lessons: { clientId: string; date: string; slot: number; slots: number }[],
  clientIds: string[],
  requestedSlots: number
): Set<string> {
  const selected = new Set(clientIds);
  const unavailable = new Set<string>();
  for (const lesson of lessons) {
    if (!selected.has(lesson.clientId)) continue;
    for (let slot = Math.max(0, lesson.slot - requestedSlots + 1); slot < Math.min(16, lesson.slot + lesson.slots); slot++) {
      unavailable.add(`${lesson.date}|${slot}`);
    }
  }
  return unavailable;
}
