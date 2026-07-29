// Blokovi termina: početak svakog časa (45 min), od 09:00 do 20:15
export const TIME_SLOTS = [
  '09:00',
  '09:45',
  '10:30',
  '11:15',
  '12:00',
  '12:45',
  '13:30',
  '14:15',
  '15:00',
  '15:45',
  '16:30',
  '17:15',
  '18:00',
  '18:45',
  '19:30',
  '20:15',
] as const;

export const SLOT_DURATION_MINUTES = 45;

/** Koliko uzastopnih slotova zauzima čas date dužine (npr. 55 min → 2 slota od 45 min). */
export function slotsNeeded(trajanjeMinuta: number | null | undefined): number {
  if (!trajanjeMinuta || trajanjeMinuta <= SLOT_DURATION_MINUTES) return 1;
  return Math.ceil(trajanjeMinuta / SLOT_DURATION_MINUTES);
}

/** Napomena kojom se prepoznaje automatski kreiran "blokirajući" nastavak (dvočas), za razliku od ručno unetog nastavka. */
export const AUTO_SPILLOVER_NAPOMENA = 'Automatski zauzeto (nastavak dužeg časa)';

/** Kraj vremena slota (npr. slot 0 = 09:00–09:45 → "09:45"). */
export function getSlotEndTime(slotIndex: number): string {
  if (slotIndex < 0 || slotIndex >= TIME_SLOTS.length) return '21:00';
  if (slotIndex < TIME_SLOTS.length - 1) return TIME_SLOTS[slotIndex + 1];
  return '21:00';
}

/** Da li je termin (datum + slot) već prošao u odnosu na trenutno vreme. */
export function isTermInPast(date: string, slotIndex: number): boolean {
  const endTime = getSlotEndTime(slotIndex);
  const termEnd = new Date(`${date}T${endTime}`);
  return termEnd.getTime() < Date.now();
}

export type TimeSlot = (typeof TIME_SLOTS)[number];

// Boje za predavače (izbor u podešavanjima)
export const INSTRUCTOR_COLORS = [
  { value: '#EAB308', label: 'Žuta' },
  { value: '#F97316', label: 'Narandžasta' },
  { value: '#EF4444', label: 'Crvena' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#8B5CF6', label: 'Ljubičasta' },
  { value: '#3B82F6', label: 'Plava' },
  { value: '#06B6D4', label: 'Cijan' },
  { value: '#10B981', label: 'Zelena' },
  { value: '#84CC16', label: 'Lime' },
  { value: '#78716C', label: 'Siva' },
] as const;

export const DEFAULT_INSTRUCTOR_COLOR = '#EAB308';
