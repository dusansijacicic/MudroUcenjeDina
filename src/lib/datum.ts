const TZ = 'Europe/Belgrade';

/** Datum (YYYY-MM-DD) datog trenutka po beogradskom vremenu. */
export function datumBeograd(when: Date | string = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(typeof when === 'string' ? new Date(when) : when);
}

/** Današnji datum po beogradskom vremenu – isti na serveru (UTC) i u browseru. */
export function danasBeograd(): string {
  return datumBeograd(new Date());
}

/** Trenutak "datum + vreme" po beogradskom vremenu kao ISO sa pomakom (npr. 2026-10-12T16:30:00+02:00). */
export function beogradIso(date: string, time: string): string {
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value;
  const offset = tz?.replace('GMT', '') || '+00:00';
  return `${date}T${time}:00${offset}`;
}

export function jeIsoDatum(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime());
}
