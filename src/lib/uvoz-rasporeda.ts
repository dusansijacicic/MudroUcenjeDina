import { TIME_SLOTS } from '@/lib/constants';

/**
 * Uvoz rasporeda (Admin → Uvoz rasporeda): prepoznavanje nalepljenog spiska i predlog koje je dete
 * koje ime sa papira. Čiste funkcije – bez baze, rade isto u browseru i na serveru.
 *
 * Podržani formati (može i mešano, red po red):
 *  1. CSV sa zaglavljem: date/datum, start_time/vreme, client_name/ime, (position/pozicija,
 *     service_code/vrsta, duration_min/trajanje, needs_review/za_proveru, review_reason/razlog).
 *  2. Spisak po detetu:  "Darija – Čas: 16.11 12:45 P1, 19.11 12:45 P1"
 *  3. Jedan termin u redu: "16.11 12:45 P1 Darija – Reed"
 * Red sa "ZA PROVERU" / "NE UNOSITI" (naslov) – svi termini ispod se podrazumevano ne uvoze.
 */

export type UvozRed = {
  /** Jedinstven u okviru jednog uvoza. */
  kljuc: string;
  linija: number;
  datum: string;
  slot: number;
  /** Pozicija sa papira ('1' = gornje polje, '2' = donje; '' = nije navedeno). */
  pozicija: string;
  /** Ime kako piše na papiru. */
  ime: string;
  /** Normalizovano ime – po njemu se grupiše i pamti izbor deteta. */
  imeKljuc: string;
  vrsta: string;
  trajanje: number;
  zaProveru: boolean;
  razlog: string;
};

export type UvozNeprepoznat = { linija: number; tekst: string };

export const PODRAZUMEVANO_TRAJANJE = 45;

const CIRILICA: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj',
  м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c',
  џ: 'dz', ш: 's',
};

/** "Đorđe Š." → "djordje s"; "Теодора Б" → "teodora b" (mala slova, bez dijakritike, tačaka i upitnika). */
export function normalizujIme(s: string): string {
  return s
    .toLowerCase()
    .replace(/[Ѐ-ӿ]/g, (c) => CIRILICA[c] ?? c)
    .replace(/[čć]/g, 'c')
    .replace(/đ/g, 'dj')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function danaIzmedju(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
}

/** "16.11", "16.11.", "16.11.2026", "2026-11-16". Bez godine: ova godina, a ako bi to bilo pre više od
 * 2 meseca – sledeća (u decembru se uvozi januar). */
export function parsirajDatum(s: string, danas: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4})\.?)?$/);
  if (!m) return null;
  if (m[3]) return iso(+m[3], +m[2], +m[1]);
  const godina = +danas.slice(0, 4);
  const ovaGodina = iso(godina, +m[2], +m[1]);
  if (!ovaGodina) return null;
  return danaIzmedju(ovaGodina, danas) < -60 ? iso(godina + 1, +m[2], +m[1]) : ovaGodina;
}

/** "12:45", "12.45", "12:45:00" → indeks u TIME_SLOTS (null ako to nije početak termina). */
export function slotZaVreme(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const i = (TIME_SLOTS as readonly string[]).indexOf(`${m[1].padStart(2, '0')}:${m[2]}`);
  return i >= 0 ? i : null;
}

/** "Reed", "REED", "МАТ (4)", "pis.", "1,5h", "Čas 1h", "CAS" → vrsta + trajanje u minutima. */
export function parsirajVrstu(tekst: string): { vrsta: string; trajanje: number } {
  let t = tekst;
  let trajanje = PODRAZUMEVANO_TRAJANJE;
  const sati = t.match(/(\d+(?:[.,]\d+)?)\s*h\b/i);
  if (sati) {
    trajanje = Math.round(parseFloat(sati[1].replace(',', '.')) * 60);
    t = t.replace(sati[0], ' ');
  }
  const minuta = t.match(/(\d+)\s*min/i);
  if (minuta) {
    trajanje = +minuta[1];
    t = t.replace(minuta[0], ' ');
  }
  t = t.replace(/\(\s*\d+\s*\)/g, ' ');
  const n = normalizujIme(t);
  let vrsta: string;
  if (n === '' || n === 'cas' || n === 'c' || n.startsWith('obican')) vrsta = 'Čas';
  else if (n.startsWith('reed') || n.startsWith('rid')) vrsta = 'Reed';
  else if (n.startsWith('mat')) vrsta = 'Mat';
  else if (n.startsWith('pis')) vrsta = 'Pisanje';
  else {
    const cist = t.replace(/\s+/g, ' ').trim();
    vrsta = cist.charAt(0).toUpperCase() + cist.slice(1);
  }
  return { vrsta, trajanje: trajanje > 0 ? trajanje : PODRAZUMEVANO_TRAJANJE };
}

/** Ključ za mapiranje vrste: "Reed", "Čas · 90 min". */
export function kljucVrste(r: { vrsta: string; trajanje: number }): string {
  return r.trajanje !== PODRAZUMEVANO_TRAJANJE ? `${r.vrsta} · ${r.trajanje} min` : r.vrsta;
}

function podeliCsvRed(linija: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let unutarNavodnika = false;
  for (let i = 0; i < linija.length; i++) {
    const c = linija[i];
    if (unutarNavodnika) {
      if (c === '"') {
        if (linija[i + 1] === '"') {
          cur += '"';
          i++;
        } else unutarNavodnika = false;
      } else cur += c;
    } else if (c === '"') unutarNavodnika = true;
    else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const CSV_KOLONE: Record<string, string[]> = {
  datum: ['date', 'datum'],
  vreme: ['start_time', 'start', 'vreme', 'time', 'pocetak'],
  ime: ['client_name', 'client', 'ime', 'klijent', 'dete', 'name'],
  pozicija: ['position', 'pozicija', 'poz'],
  vrsta: ['service_code', 'service', 'vrsta', 'usluga', 'tip'],
  trajanje: ['duration_min', 'duration', 'trajanje'],
  zaProveru: ['needs_review', 'za_proveru', 'proveri'],
  razlog: ['review_reason', 'razlog'],
};

function csvZaglavlje(linija: string): { sep: string; kolone: Record<string, number> } | null {
  const sep = [',', ';', '\t'].sort((a, b) => linija.split(b).length - linija.split(a).length)[0];
  const imena = podeliCsvRed(linija, sep).map((h) => h.toLowerCase().replace(/[^a-z_]/g, ''));
  const kolone: Record<string, number> = {};
  for (const [polje, nazivi] of Object.entries(CSV_KOLONE)) {
    const i = imena.findIndex((h) => nazivi.includes(h));
    if (i >= 0) kolone[polje] = i;
  }
  return kolone.datum !== undefined && kolone.vreme !== undefined && kolone.ime !== undefined ? { sep, kolone } : null;
}

const ISTINA = new Set(['true', '1', 'da', 'yes', 'x', 'y', 'd']);
const SPISAK_RE = /^(.+?)\s+[–—-]\s+(.+?):\s*(.+)$/;
const UNOS_RE = /(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4})\.?)?\s+(\d{1,2}[:.]\d{2})(?:\s*P\s*([1-9]))?/gi;
const JEDAN_RE =
  /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\.\s*\d{1,2}\.?(?:\s*\d{4}\.?)?)\s+(\d{1,2}[:.]\d{2})\s+(?:P\s*([1-9])\s+)?(.+?)(?:\s+[–—-]\s+(.+))?$/i;

export function parsirajRaspored(tekst: string, danas: string): { redovi: UvozRed[]; neprepoznati: UvozNeprepoznat[] } {
  const redovi: UvozRed[] = [];
  const neprepoznati: UvozNeprepoznat[] = [];
  let csv: { sep: string; kolone: Record<string, number> } | null = null;
  let sekcijaZaProveru = false;

  const dodaj = (
    linija: number,
    p: { datum: string | null; vreme: string; pozicija: string; ime: string; vrsta: string; trajanje?: number; zaProveru?: boolean; razlog?: string },
    tekstLinije: string
  ): boolean => {
    const slot = slotZaVreme(p.vreme);
    const ime = p.ime.replace(/\s+/g, ' ').trim();
    const imeKljuc = normalizujIme(ime);
    if (!p.datum || slot === null || !imeKljuc) {
      neprepoznati.push({ linija, tekst: tekstLinije });
      return false;
    }
    const v = parsirajVrstu(p.vrsta);
    const sumnjivo = ime.includes('?');
    redovi.push({
      kljuc: `${linija}-${redovi.length}`,
      linija,
      datum: p.datum,
      slot,
      pozicija: p.pozicija,
      ime,
      imeKljuc,
      vrsta: v.vrsta,
      trajanje: p.trajanje && p.trajanje > 0 ? p.trajanje : v.trajanje,
      zaProveru: !!p.zaProveru || sekcijaZaProveru || sumnjivo,
      razlog: p.razlog || (sekcijaZaProveru ? 'u delu „za proveru“' : sumnjivo ? 'upitnik uz ime' : ''),
    });
    return true;
  };

  tekst.split(/\r?\n/).forEach((sirovo, i) => {
    const linija = i + 1;
    const t = sirovo.trim();
    if (!t) return;

    if (!csv) {
      const z = csvZaglavlje(t);
      if (z) {
        csv = z;
        return;
      }
    }
    if (csv) {
      const polja = podeliCsvRed(t, csv.sep);
      const k = csv.kolone;
      const uzmi = (polje: string) => (k[polje] !== undefined ? (polja[k[polje]] ?? '') : '');
      if (polja.length > 1 && uzmi('datum')) {
        const trajanje = parseInt(uzmi('trajanje'), 10);
        dodaj(
          linija,
          {
            datum: parsirajDatum(uzmi('datum'), danas),
            vreme: uzmi('vreme'),
            pozicija: uzmi('pozicija').replace(/\D/g, ''),
            ime: uzmi('ime'),
            vrsta: uzmi('vrsta'),
            trajanje: Number.isFinite(trajanje) ? trajanje : undefined,
            zaProveru: ISTINA.has(uzmi('zaProveru').toLowerCase()),
            razlog: uzmi('razlog'),
          },
          t
        );
        return;
      }
    }

    const n = normalizujIme(t);
    const imaBroj = /\d/.test(t);
    if (!imaBroj) {
      if (/(ne unositi|za proveru|proveri)/.test(n)) sekcijaZaProveru = true;
      else if (/^termini\b/.test(n)) sekcijaZaProveru = false;
      return;
    }

    const jedan = t.match(JEDAN_RE);
    if (jedan) {
      dodaj(
        linija,
        { datum: parsirajDatum(jedan[1], danas), vreme: jedan[2], pozicija: jedan[3] ?? '', ime: jedan[4], vrsta: jedan[5] ?? '' },
        t
      );
      return;
    }

    const spisak = t.match(SPISAK_RE);
    if (spisak) {
      const unosi = [...spisak[3].matchAll(UNOS_RE)];
      if (unosi.length > 0) {
        for (const u of unosi) {
          const datum = u[3] ? iso(+u[3], +u[2], +u[1]) : parsirajDatum(`${u[1]}.${u[2]}`, danas);
          dodaj(linija, { datum, vreme: u[4], pozicija: u[5] ?? '', ime: spisak[1], vrsta: spisak[2] }, t);
        }
        return;
      }
    }
    neprepoznati.push({ linija, tekst: t });
  });

  return { redovi, neprepoznati };
}

// ─── Ko je ko: predlog deteta za ime sa papira ─────────────────────────────────

export type KlijentZaUvoz = {
  id: string;
  ime: string;
  prezime: string;
  godiste: number | null;
  razred: string | null;
  roditelj: string | null;
};

type KlijentNorm = { k: KlijentZaUvoz; ime: string; prezime: string };

export function pripremiKlijente(klijenti: KlijentZaUvoz[]): KlijentNorm[] {
  return klijenti.map((k) => ({ k, ime: normalizujIme(k.ime), prezime: normalizujIme(k.prezime ?? '') }));
}

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/**
 * "Lena K." → jaki kandidati: deca koja se zovu Lena i prezime im počinje na K. Slični: imena koja liče
 * (Katra ↔ Katarina, Mila ↔ Milan) – nikad se ne biraju sami.
 */
export function kandidatiZaIme(imeKljuc: string, klijenti: KlijentNorm[]): { jaki: KlijentZaUvoz[]; slicni: KlijentZaUvoz[] } {
  const delovi = imeKljuc.split(' ').filter(Boolean);
  if (delovi.length === 0) return { jaki: [], slicni: [] };
  const [prvo, ...ostalo] = delovi;
  const prez = ostalo.join(' ');
  const imeOdgovara = (ime: string) => ime === prvo || ime.startsWith(`${prvo} `);
  let jaki = klijenti.filter((c) => imeOdgovara(c.ime) && (!prez || c.prezime.startsWith(prez)));
  // Možda je napisano "Prezime Ime".
  if (jaki.length === 0 && prez) {
    jaki = klijenti.filter((c) => c.prezime === prvo && c.ime.startsWith(prez));
  }
  const jakiId = new Set(jaki.map((c) => c.k.id));
  const slicni = klijenti
    .filter((c) => !jakiId.has(c.k.id))
    .map((c) => {
      const prvoIme = c.ime.split(' ')[0];
      const razlika = levenshtein(prvoIme, prvo);
      const lici = (prvo.length >= 4 && razlika <= 2) || (prvo.length >= 3 && prvoIme.startsWith(prvo.slice(0, 3)));
      const prezimeOk = !prez || c.prezime.startsWith(prez.slice(0, 1));
      return { c, razlika, ok: lici && prezimeOk };
    })
    .filter((x) => x.ok)
    .sort((a, b) => a.razlika - b.razlika)
    .slice(0, 8)
    .map((x) => x.c.k);
  return { jaki: jaki.map((c) => c.k), slicni };
}

const DANI = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub'];

/** Ključ "dan u nedelji – vreme", npr. "1-5" = ponedeljak 12:45. */
export function kljucDanVreme(datum: string, slot: number): string {
  return `${new Date(`${datum}T12:00:00Z`).getUTCDay()}-${slot}`;
}

export function opisDanVreme(kljuc: string): string {
  const [dan, slot] = kljuc.split('-').map(Number);
  return `${DANI[dan] ?? '?'} ${TIME_SLOTS[slot] ?? '?'}`;
}

export function kratakDatum(datum: string): string {
  const [, m, d] = datum.split('-');
  return `${DANI[new Date(`${datum}T12:00:00Z`).getUTCDay()]} ${+d}.${+m}.`;
}
