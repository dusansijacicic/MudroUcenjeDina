// Blokovi termina: početak svakog časa (45 min), od 10:30 do 19:30
export const TIME_SLOTS = [
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
] as const;

export const SLOT_DURATION_MINUTES = 45;

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
