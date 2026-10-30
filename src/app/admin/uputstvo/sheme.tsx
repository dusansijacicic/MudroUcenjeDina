/**
 * Šeme ekrana za uputstvo: uprošćeni crteži stranica (isti natpisi, dugmad i boje kao u aplikaciji),
 * sa numerisanim markerima koji odgovaraju koracima u tekstu. Nisu prave snimke ekrana – ne zavise od
 * podataka u bazi i ne zastarevaju kad se promeni jedno dete ili termin.
 */

type Ton = 'amber' | 'stone' | 'svetlo' | 'emerald' | 'red' | 'tamno' | 'okvir' | 'sky' | 'plavo' | 'ljubicasto';

const TONOVI: Record<Ton, string> = {
  amber: 'bg-amber-600 text-white',
  stone: 'bg-stone-200 text-stone-700',
  svetlo: 'bg-stone-100 text-stone-600',
  emerald: 'bg-emerald-600 text-white',
  red: 'bg-red-600 text-white',
  tamno: 'bg-stone-800 text-white',
  okvir: 'border border-stone-300 bg-white text-stone-700',
  sky: 'bg-sky-100 text-sky-900',
  plavo: 'bg-blue-600 text-white',
  ljubicasto: 'bg-violet-50 text-violet-900 border border-violet-300',
};

/** Numerisani marker (odgovara koraku u tekstu). */
export function M({ n }: { n: number | string }) {
  return (
    <span className="mx-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 align-middle text-[11px] font-bold leading-none text-white shadow ring-2 ring-white">
      {n}
    </span>
  );
}

/** Okvir "ekrana" sa natpisom šta prikazuje. */
export function Ekran({ naslov, children, sirina = 'min-w-[560px]' }: { naslov: string; children: React.ReactNode; sirina?: string }) {
  return (
    <figure className="my-2" role="img" aria-label={`Šema ekrana: ${naslov}`}>
      <div className="overflow-x-auto rounded-xl border border-stone-300 bg-stone-100 shadow-inner">
        <div className={sirina}>
          <div className="flex items-center gap-1.5 border-b border-stone-300 bg-stone-200/80 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-stone-400" />
            <span className="h-2 w-2 rounded-full bg-stone-400" />
            <span className="h-2 w-2 rounded-full bg-stone-400" />
            <span className="ml-2 text-[11px] font-medium text-stone-600">{naslov}</span>
          </div>
          <div className="space-y-2 p-3 text-[11px] leading-snug text-stone-800">{children}</div>
        </div>
      </div>
      <figcaption className="mt-1 text-xs text-stone-500">Šema ekrana – brojevi u narandžastim kružićima odgovaraju koracima ispod.</figcaption>
    </figure>
  );
}

export function Dugme({ children, ton = 'stone' }: { children: React.ReactNode; ton?: Ton }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 font-medium ${TONOVI[ton]}`}>{children}</span>;
}

export function Polje({ label, vrednost, prazno }: { label?: string; vrednost?: string; prazno?: string }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      {label && <span className="font-medium text-stone-600">{label}</span>}
      <span className={`min-w-[110px] rounded-md border border-stone-300 bg-white px-2 py-1 ${vrednost ? 'text-stone-800' : 'text-stone-400'}`}>
        {vrednost ?? prazno ?? ''}
      </span>
    </span>
  );
}

function Kutija({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-stone-200 bg-white p-2 ${className}`}>{children}</div>;
}

const RED = {
  zuta: { backgroundColor: '#fef3c7', borderLeft: '3px solid #f59e0b' },
  plava: { backgroundColor: '#dbeafe', borderLeft: '3px solid #3b82f6' },
  zelena: { backgroundColor: '#dcfce7', borderLeft: '3px solid #22c55e' },
  neplaceno: { backgroundColor: '#fecaca', borderLeft: '3px solid #dc2626' },
};

/** Uprošćena kartica termina sa kalendara. */
function Kartica({
  instruktor,
  boja,
  vrsta,
  ucionica,
  deca,
  oznaka,
}: {
  instruktor: string;
  boja: string;
  vrsta: string;
  ucionica: string;
  deca: { ime: string; red: keyof typeof RED; xy: string }[];
  oznaka?: React.ReactNode;
}) {
  const crveno = deca.some((d) => d.red === 'neplaceno');
  return (
    <div className={`overflow-hidden rounded-md border bg-white ${crveno ? 'border-red-500 ring-1 ring-red-500' : 'border-stone-200'}`}>
      <div className="flex items-baseline justify-between gap-1 px-1.5 py-0.5 text-[10px]">
        <span className="font-semibold" style={{ color: boja }}>
          {oznaka}
          {instruktor}
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-stone-500">{vrsta}</span>
          <span className="rounded bg-stone-100 px-1 font-medium text-stone-600">{ucionica}</span>
        </span>
      </div>
      {deca.map((d) => (
        <div key={d.ime} style={RED[d.red]} className="flex flex-wrap items-baseline gap-x-1 px-1.5 py-0.5 font-semibold">
          <span>{d.ime}</span>
          {d.red === 'neplaceno' ? (
            <span className="ml-auto rounded bg-red-600 px-1 text-[10px] font-bold text-white">{d.xy}</span>
          ) : (
            <span className={`ml-auto text-[10px] ${d.xy.includes('poslednji') ? 'font-bold text-amber-700' : 'font-medium text-stone-500'}`}>{d.xy}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Zahtev({ ime }: { ime: string }) {
  return (
    <div className="rounded-md border border-dashed border-amber-500 bg-amber-100 px-1.5 py-1 text-amber-950">
      <span className="font-medium">{ime}</span>
      <span className="block text-[9px] uppercase tracking-wide">zahtev · čeka predavača</span>
    </div>
  );
}

// ───────────────────────────── Šeme po stranicama ─────────────────────────────

export function SemaMeni() {
  return (
    <Ekran naslov="Gornji meni (admin)" sirina="min-w-[680px]">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-stone-800 p-2">
        <M n={2} />
        <Dugme ton="amber">+ Zakaži termin</Dugme>
        <M n={1} />
        <span className="rounded-md bg-amber-500 px-2 py-1 font-medium text-white">Kalendar</span>
        <M n={3} />
        <span className="rounded-md border border-stone-500 px-2 py-1 font-medium text-stone-200">+ Unesi uplatu</span>
        <span className="px-1 text-stone-300">Evidencija uplata</span>
        <M n={4} />
        <span className="px-1 text-stone-300">Klijenti</span>
        <span className="text-stone-500">| Vrste časova · Kategorije · Programi · Učionice · Testiranja · Blokirani · Instruktori |</span>
        <span className="px-1 text-stone-300">Dnevnik aktivnosti</span>
        <M n={5} />
        <span className="px-1 text-stone-300">Podešavanja</span>
        <Dugme ton="sky">❓ Uputstvo</Dugme>
      </div>
    </Ekran>
  );
}

export function SemaKalendar() {
  const dani = ['Pon 2.11.', 'Uto 3.11.', 'Sre 4.11.', 'Čet 5.11.'];
  return (
    <Ekran naslov="Kalendar" sirina="min-w-[720px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Kalendar (svi instruktori)</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <M n={1} />
          <span className="inline-flex rounded-md border border-stone-200 bg-white p-0.5">
            <span className="px-2 py-0.5 text-stone-600">Dan</span>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">Nedelja</span>
            <span className="px-2 py-0.5 text-stone-600">Mesec</span>
          </span>
          <span className="text-stone-500">Dete:</span>
          <Polje prazno="Kucaj ime deteta…" />
          <span className="text-stone-500">Instruktor:</span>
          <Polje vrednost="Svi" />
          <Dugme ton="amber">Novi termin</Dugme>
        </span>
      </div>
      <Kutija className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-stone-600">Legenda boja instruktora:</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-violet-400" />Časlav Mančić</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-orange-500" />Dina Mateja</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-blue-900" />Pavle Miličković</span>
      </Kutija>
      <Kutija className="flex flex-wrap items-center gap-1.5">
        <Dugme>Swap</Dugme>
        <Dugme>Copy</Dugme>
        <Dugme>Delete</Dugme>
        <Dugme>Zakaži više časova</Dugme>
        <Dugme>Dodeli instruktora/učionicu/vrstu</Dugme>
        <Dugme>Blokiraj termin(e)</Dugme>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="font-medium text-stone-700">2.11. – 15.11.2026</span>
          <M n={2} />
          <Dugme>← Prethodna</Dugme>
          <Dugme>Sledeća →</Dugme>
          <Dugme ton="svetlo">🖨 Print / PDF</Dugme>
        </span>
      </Kutija>
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="grid grid-cols-[52px_repeat(4,minmax(0,1fr))] border-b border-stone-200 bg-stone-50 text-center font-medium text-stone-600">
          <span className="p-1" />
          {dani.map((d, i) => (
            <span key={d} className={`p-1 ${i === 2 ? 'bg-violet-100 text-violet-800' : ''}`}>{d}</span>
          ))}
        </div>
        {[
          { t: '16:30', hover: false },
          { t: '17:15', hover: true },
        ].map((row) => (
          <div key={row.t} className="grid grid-cols-[52px_repeat(4,minmax(0,1fr))] border-b border-stone-100">
            <span className={`p-1 font-medium ${row.hover ? 'bg-violet-100 font-bold text-violet-800' : 'text-stone-500'}`}>{row.t}</span>
            {dani.map((d, i) => {
              const hoverCell = row.hover || i === 2;
              const fokus = row.hover && i === 2;
              return (
                <div
                  key={d}
                  className={`min-h-[44px] p-1 ${hoverCell ? 'bg-purple-600/[0.08]' : ''}`}
                  style={fokus ? { boxShadow: 'inset 0 0 0 2px rgb(126 34 206 / 0.35)' } : undefined}
                >
                  {row.t === '16:30' && i === 0 && (
                    <Kartica instruktor="Dina M." boja="#f97316" vrsta="Matematika" ucionica="U1" deca={[{ ime: 'Ana P.', red: 'zuta', xy: '7/10 · još 3' }]} />
                  )}
                  {row.t === '17:15' && i === 2 && (
                    <span className="flex items-center gap-1 text-stone-500">
                      <M n={3} /> miš ovde
                    </span>
                  )}
                  {row.t === '17:15' && i === 0 && <span className="text-stone-400">+</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Ekran>
  );
}

export function SemaKartica() {
  return (
    <Ekran naslov="Jedno vreme na kalendaru (npr. 17:15) – kako čitati" sirina="min-w-[440px]">
      <div className="grid max-w-[380px] gap-1.5">
        <div className="flex flex-wrap items-center gap-1 text-stone-600">
          <M n="A" /> instruktor <M n="B" /> vrsta časa <M n="C" /> učionica
        </div>
        <Kartica
          instruktor="Časlav Mančić"
          boja="#a78bfa"
          vrsta="Matematika"
          ucionica="U2"
          oznaka={null}
          deca={[
            { ime: 'Marko Jović', red: 'zuta', xy: '7/10 · još 3' },
            { ime: 'Ana Petrović', red: 'plava', xy: '10/10 · poslednji' },
            { ime: 'Luka Ilić', red: 'neplaceno', xy: '! 11/10' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-1 text-stone-600">
          <M n="D" /> svako dete u svom redu (žuta, plava…) <M n="E" /> x/y · još N <M n="F" /> crveni red = nije plaćeno
        </div>
        <div className="flex items-center gap-1">
          <M n="G" />
          <div className="flex-1">
            <Zahtev ime="Sara Kostić" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <M n="H" />
          <div className="flex-1 rounded-md border border-stone-300 bg-stone-100 px-1.5 py-1 text-stone-500 line-through decoration-stone-400">Otkazano: Mila S.</div>
          <div className="flex-1 rounded-md border border-red-300 px-1.5 py-1 font-semibold text-red-800" style={{ background: 'repeating-linear-gradient(45deg,#fee2e2 0 6px,#fef2f2 6px 12px)' }}>
            ⛔ Blokirano
          </div>
        </div>
      </div>
    </Ekran>
  );
}

export function SemaFilter() {
  return (
    <Ekran naslov="Kalendar – filter po detetu" sirina="min-w-[600px]">
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <p className="mb-1 font-medium text-stone-500">Pre izbora</p>
          <span className="flex items-start gap-1">
            <M n={1} />
            <span className="flex flex-col">
              <span className="text-stone-500">Dete:</span>
              <span className="w-44 rounded-md border border-violet-400 bg-white px-2 py-1 ring-2 ring-violet-200">ana</span>
              <span className="mt-1 w-52 rounded-md border border-stone-200 bg-white py-0.5 shadow-lg">
                <span className="flex items-center gap-1 bg-violet-50 px-2 py-1 text-violet-900">
                  <M n={2} /> Ana Petrović
                </span>
                <span className="block px-2 py-1">Ana Marić</span>
                <span className="block px-2 py-1">Jovana Ilić</span>
              </span>
            </span>
          </span>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-stone-500">Posle izbora</p>
          <span className="flex items-center gap-1">
            <span className="text-stone-500">Dete:</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 py-0.5 pl-2 pr-1 font-medium text-violet-900">
              Ana Petrović <span className="rounded px-1 text-violet-700">✕</span>
            </span>
            <M n={4} />
            <M n={5} />
            <span className="text-stone-500">Instruktor:</span>
            <Polje vrednost="Svi" />
          </span>
          <span className="flex items-center gap-1">
            <M n={3} />
            <span className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-violet-950">
              Samo termini za: <strong>Ana Petrović</strong> – ove dve nedelje: <strong>4</strong> zakazano ·{' '}
              <span className="font-medium text-violet-800">Ceo mesec za ovo dete →</span>
            </span>
          </span>
        </div>
      </div>
    </Ekran>
  );
}

export function SemaModovi() {
  return (
    <Ekran naslov="Kalendar – mod Swap (isto važi za Copy, Delete, Zakaži više časova, Dodeli)" sirina="min-w-[700px]">
      <Kutija className="flex flex-wrap items-center gap-1.5">
        <M n={1} />
        <Dugme ton="amber">Swap: uključen</Dugme>
        <Dugme>Copy</Dugme>
        <Dugme>Delete</Dugme>
        <Dugme>Zakaži više časova</Dugme>
        <span className="ml-auto flex items-center gap-1.5">
          <Dugme>← Prethodna</Dugme>
          <Dugme>Sledeća →</Dugme>
          <M n={4} />
          <Dugme ton="emerald">✓ Potvrdi zamenu</Dugme>
          <Dugme ton="svetlo">🖨 Print / PDF</Dugme>
        </span>
      </Kutija>
      <Kutija className="flex flex-wrap items-center gap-3">
        <M n={2} />
        {['Termin', 'Instruktor', 'Učionica', 'Klijent'].map((x, i) => (
          <span key={x} className="flex items-center gap-1">
            <span className={`flex h-3 w-3 items-center justify-center rounded-sm border ${i === 0 ? 'border-amber-600 bg-amber-600 text-[8px] text-white' : 'border-stone-400 bg-white'}`}>
              {i === 0 ? '✓' : ''}
            </span>
            {x}
          </span>
        ))}
      </Kutija>
      <div className="flex flex-wrap items-start gap-3">
        <M n={3} />
        <div className="w-44 rounded-lg ring-2 ring-amber-500 ring-offset-1">
          <Kartica instruktor="Dina M." boja="#f97316" vrsta="Matematika" ucionica="U1" deca={[{ ime: 'Ana P.', red: 'zuta', xy: '7/10 · još 3' }]} />
          <span className="block bg-amber-500 px-1 text-center font-bold text-white">1. izabran</span>
        </div>
        <div className="w-44 rounded-lg ring-2 ring-amber-500 ring-offset-1">
          <Kartica instruktor="Pavle M." boja="#1e3a8a" vrsta="Srpski" ucionica="U3" deca={[{ ime: 'Luka I.', red: 'zuta', xy: '2/8 · još 6' }]} />
          <span className="block bg-amber-500 px-1 text-center font-bold text-white">2. izabran</span>
        </div>
      </div>
    </Ekran>
  );
}

export function SemaBlokiranje() {
  return (
    <Ekran naslov="Kalendar – Blokiraj termin(e)" sirina="min-w-[620px]">
      <Kutija className="flex flex-wrap items-center gap-1.5">
        <M n={1} />
        <Dugme ton="tamno">Blokiraj termin(e): uključeno</Dugme>
        <span className="ml-auto flex items-center gap-1.5">
          <M n={4} />
          <Dugme ton="tamno">✓ Blokiraj (2)</Dugme>
          <Dugme ton="svetlo">🖨 Print / PDF</Dugme>
        </span>
      </Kutija>
      <Kutija className="flex flex-wrap items-end gap-2">
        <M n={2} />
        <Polje label="Napomena – zašto se blokira" vrednost="Praznik" />
      </Kutija>
      <div className="flex flex-wrap items-start gap-2">
        <M n={3} />
        {['Pon 9:00', 'Pon 9:45'].map((x) => (
          <div key={x} className="w-36 rounded-md border-2 border-stone-800 bg-stone-100 p-1.5 text-center font-semibold">
            {x}
            <span className="block text-[10px] font-medium text-stone-600">⛔ izabrano za blokiranje</span>
          </div>
        ))}
        <M n={5} />
        <div className="w-40 rounded-md border border-red-300 p-1.5 font-semibold text-red-800" style={{ background: 'repeating-linear-gradient(45deg,#fee2e2 0 6px,#fef2f2 6px 12px)' }}>
          ⛔ Blokirano · Praznik
          <span className="mt-1 block w-fit rounded border border-red-300 bg-white px-1 font-medium">Odblokiraj</span>
        </div>
      </div>
    </Ekran>
  );
}

export function SemaZakazivanje() {
  return (
    <Ekran naslov="Zakaži termin" sirina="min-w-[640px]">
      <div className="flex items-center gap-1">
        <M n={1} />
        <Dugme ton="amber">+ Zakaži termin</Dugme>
        <span className="text-stone-500">(meni) ili „+“ u ćeliji kalendara</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Kutija className="space-y-1.5">
          <div className="flex flex-wrap items-end gap-2">
            <M n={3} />
            <Polje label="Datum" vrednost="04.11.2026." />
            <Polje label="Vreme (slot)" vrednost="17:15" />
          </div>
          <div className="flex flex-wrap items-end gap-2 pl-6">
            <Polje label="Kategorija termina" vrednost="Individualni" />
            <Polje label="Vrsta časa" vrednost="Matematika" />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <M n={4} />
            <Polje label="Instruktor" vrednost="Bez instruktora" />
            <Polje label="Učionica" vrednost="Bez učionice" />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <M n={5} />
            <Polje label="Napomena za termin (opciono)" prazno="…" />
            <Polje label="i narednih N dana" vrednost="0" />
          </div>
          <div className="flex items-center gap-1 pt-1">
            <M n={6} />
            <Dugme ton="amber">Zakaži termin</Dugme>
          </div>
        </Kutija>
        <Kutija className="space-y-1">
          <div className="flex items-center gap-1">
            <M n={2} />
            <span className="font-medium text-stone-600">Pretraga klijenata</span>
          </div>
          <span className="block rounded-md border border-stone-300 bg-white px-2 py-1">mar</span>
          <span className="block rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-900">Marko Jović (2015) ✓</span>
          <span className="block px-2 py-1">Marija Lazić (2014)</span>
          <span className="block px-2 py-1">Marta Ilić (2016)</span>
        </Kutija>
      </div>
    </Ekran>
  );
}

export function SemaTermin() {
  return (
    <Ekran naslov="Stranica termina (klik na termin u kalendaru)" sirina="min-w-[600px]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">sreda, 4. novembar 2026.</p>
          <p className="text-stone-500">17:15 · Instruktor: Dina Mateja · Kategorija: Individualni</p>
        </div>
        <span className="flex items-center gap-1">
          <M n={5} />
          <span className="rounded-md border border-red-200 px-2 py-1 text-red-600">Otkaži termin</span>
        </span>
      </div>
      <Kutija className="flex flex-wrap items-end gap-2">
        <M n={1} />
        <span className="font-medium">Kategorija i napomena termina</span>
        <Polje vrednost="Individualni" />
        <Polje prazno="Napomena…" />
        <Dugme ton="amber">Sačuvaj</Dugme>
      </Kutija>
      <div className="flex items-center gap-1">
        <M n={3} />
        <Dugme ton="amber">+ Dodaj radionicu</Dugme>
        <span className="text-stone-500">1 / 4 radionica</span>
      </div>
      <Kutija className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <M n={2} />
            <span className="font-semibold underline">Ana Petrović</span>
            <span className="font-medium text-amber-700">Profil, uplate i održani časovi →</span>
          </div>
          <span className="inline-block rounded bg-stone-100 px-1.5 py-0.5 font-medium">7. čas od 10 plaćenih · preostalo još 3</span>
        </div>
        <span className="flex items-center gap-1">
          <M n={4} />
          <span className="text-amber-600">Izmeni</span>
        </span>
      </Kutija>
    </Ekran>
  );
}

export function SemaKlijenti() {
  return (
    <Ekran naslov="Klijenti" sirina="min-w-[680px]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1">
          <M n={1} />
          <Polje prazno="Pretraga po imenu, prezimenu, školi ili telefonu…" />
        </span>
        <span className="flex items-center gap-1">
          <M n={5} />
          <Dugme ton="amber">+ Novi klijent</Dugme>
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="grid grid-cols-[1.2fr_2.4fr_0.8fr] gap-2 border-b border-stone-200 bg-stone-50 p-1.5 font-medium text-stone-600">
          <span>Ime i prezime</span>
          <span>Održano do danas / kupljeno / preostalo, po vrsti časa</span>
          <span>Akcija</span>
        </div>
        <div className="grid grid-cols-[1.2fr_2.4fr_0.8fr] items-start gap-2 p-1.5">
          <span>
            <span className="flex items-center gap-1">
              <M n={4} />
              <span className="font-medium underline">Luka Ilić</span>
            </span>
            <span className="block font-medium text-amber-700">Profil, uplate i održani časovi →</span>
          </span>
          <span className="space-y-0.5">
            <span className="flex flex-wrap items-center gap-1">
              <M n={2} />
              <strong>Matematika:</strong> održano <strong>12</strong> · kupljeno 10 ·
              <span className="rounded bg-red-100 px-1 font-semibold text-red-700">nije plaćeno 2</span>
              <M n={3} />
              <span className="rounded border border-emerald-300 bg-emerald-50 px-1 font-semibold text-emerald-800">✓ Označi kao plaćeno</span>
            </span>
            <span className="block pl-6">
              <strong>Srpski:</strong> održano <strong>3</strong> · kupljeno 8 · <span className="font-medium text-amber-700">preostalo 5</span>
            </span>
          </span>
          <span className="text-amber-600">Izmeni</span>
        </div>
      </div>
    </Ekran>
  );
}

export function SemaProfil() {
  return (
    <Ekran naslov="Profil deteta" sirina="min-w-[640px]">
      <Kutija>
        <span className="flex items-center gap-1 font-semibold">
          <M n={1} /> Pregled po vrstama časova
        </span>
        <span className="mt-1 block text-stone-600">Matematika — plaćeno 10 · održano 7 · <span className="font-medium text-amber-800">preostalo 3</span></span>
      </Kutija>
      <Kutija className="space-y-1">
        <span className="flex items-center justify-between">
          <span className="flex items-center gap-1 font-semibold">
            <M n={2} /> Uplate <span className="font-normal text-stone-500">· Ukupno: 15.000 RSD · 10 plaćenih časova</span>
          </span>
          <Dugme ton="amber">+ Dodaj uplatu</Dugme>
        </span>
        <span className="grid grid-cols-[1fr_1fr_0.6fr_1fr_1fr] gap-2 text-stone-700">
          <span>12.10.2026.</span>
          <span>Matematika</span>
          <span>10</span>
          <span>15.000 RSD</span>
          <span>
            <span className="text-amber-700">Izmeni</span> | <span className="text-red-600">Obriši</span>
          </span>
        </span>
      </Kutija>
      <Kutija>
        <span className="flex items-center gap-1 font-semibold">
          <M n={3} /> Pregled termina
        </span>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="font-medium">Zakazani za budućnost</span>
            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-1.5">
              <strong>pon, 09. nov 2026.</strong> 17:15 <span className="float-right rounded-full bg-amber-200 px-1.5">Čeka instruktora</span>
              <span className="block text-stone-600">Bez instruktora · Matematika</span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="font-medium">Održani</span>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5">
              <strong>sre, 04. nov 2026.</strong> 17:15
              <span className="flex justify-between text-stone-600">
                <span>
                  <strong className="text-stone-800">Matematika</strong> · Dina Mateja
                </span>
                <strong className="text-stone-800">1.500 RSD</strong>
              </span>
            </div>
          </div>
        </div>
      </Kutija>
      <div className="flex flex-wrap gap-2">
        <Kutija className="flex flex-1 items-center gap-1 font-semibold">
          <M n={4} /> Otkazani termini
        </Kutija>
        <Kutija className="flex flex-1 items-center gap-1 font-semibold">
          <M n={5} /> Izmena podataka klijenta
        </Kutija>
      </div>
    </Ekran>
  );
}

export function SemaUplataForma() {
  return (
    <Ekran naslov="Unesi uplatu" sirina="min-w-[520px]">
      <div className="flex items-center gap-1">
        <M n={1} />
        <span className="rounded-md bg-stone-800 px-2 py-1 font-medium text-stone-200">+ Unesi uplatu</span>
        <span className="text-stone-500">(meni)</span>
      </div>
      <Kutija className="max-w-[400px] space-y-1.5">
        <div className="flex items-end gap-1">
          <M n={2} />
          <Polje label="Ko je primio (instruktor) *" vrednost="Časlav Mančić" />
        </div>
        <div className="flex items-end gap-1">
          <M n={3} />
          <Polje label="Datum uplate *" vrednost="29.10.2026." />
          <span className="pb-1 text-amber-700">Vrati na danas</span>
        </div>
        <div className="flex items-end gap-1">
          <M n={4} />
          <Polje label="Klijent *" vrednost="Ana Petrović ✓" />
        </div>
        <div className="flex items-end gap-1">
          <M n={5} />
          <Polje label="Vrsta časa" vrednost="Matematika — 1.500 RSD/čas" />
          <Polje label="Broj časova" vrednost="10" />
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1">
          Izračunata cena: <strong>13.500 RSD</strong> <span className="text-stone-500">(1.500 × 10 − 10% popust)</span>
        </div>
        <div className="flex items-end gap-1">
          <M n={6} />
          <Polje label="Popust (%)" prazno="10" />
          <Polje label="Iznos (RSD)" vrednost="13500" />
          <Polje label="Napomena" prazno="…" />
        </div>
        <div className="flex items-center gap-1 pt-1">
          <M n={7} />
          <Dugme ton="amber">Unesi uplatu</Dugme>
          <Dugme ton="okvir">Nazad</Dugme>
        </div>
      </Kutija>
    </Ekran>
  );
}

export function SemaUplateLista() {
  return (
    <Ekran naslov="Evidencija uplata – izmena i brisanje" sirina="min-w-[620px]">
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="grid grid-cols-[1.1fr_1fr_1fr_0.8fr_0.6fr_1fr] gap-2 border-b border-stone-200 bg-stone-50 p-1.5 font-medium text-stone-600">
          <span>Datum i vreme</span>
          <span>Primio</span>
          <span>Klijent</span>
          <span>Iznos</span>
          <span>Br. č.</span>
          <span>Akcije</span>
        </div>
        <div className="grid grid-cols-[1.1fr_1fr_1fr_0.8fr_0.6fr_1fr] items-center gap-2 p-1.5">
          <span>29.10.2026. 16:20</span>
          <span>Časlav Mančić</span>
          <span>Ana Petrović</span>
          <span>13.500 RSD</span>
          <span>10</span>
          <span className="flex items-center gap-1">
            <M n={1} />
            <span className="text-amber-700">Izmeni</span>
            <span className="text-stone-300">|</span>
            <M n={2} />
            <span className="text-red-600">Obriši</span>
          </span>
        </div>
      </div>
    </Ekran>
  );
}

export function SemaBlokirani() {
  return (
    <Ekran naslov="Blokirani termini" sirina="min-w-[520px]">
      <Kutija className="space-y-1">
        <span className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <M n={1} />
            <strong>pon, 9. nov 2026. · 9:00</strong> <span className="text-stone-500">– Praznik</span>
          </span>
          <span className="flex items-center gap-1">
            <M n={3} />
            <span className="rounded border border-stone-300 px-1.5 py-0.5">Odblokiraj</span>
          </span>
        </span>
        <span className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-800">
          <M n={2} /> Treba premestiti: <span className="font-medium underline">Ana Petrović · Dina Mateja</span>
        </span>
      </Kutija>
    </Ekran>
  );
}

export function SemaTestiranja() {
  return (
    <Ekran naslov="Termin testiranja" sirina="min-w-[560px]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1">
          <M n={1} />
          <span className="font-semibold">Potencijalni klijenti (1)</span>
        </span>
        <span className="flex items-center gap-1">
          <M n={2} />
          <Dugme ton="amber">+ Dodaj</Dugme>
        </span>
      </div>
      <Kutija className="flex items-start justify-between gap-2">
        <span>
          <strong>Mila Savić</strong> <span className="text-stone-500">3. razred</span>{' '}
          <M n={3} />
          <span className="rounded-full bg-emerald-100 px-1.5 font-medium text-emerald-700">Pojavio se</span>
          <span className="block text-stone-500">Roditelj: Jelena Savić · 064…</span>
        </span>
        <span className="flex items-center gap-1">
          <M n={4} />
          <Dugme ton="emerald">Prebaci u klijenta</Dugme>
          <span className="text-amber-600">Izmeni</span>
        </span>
      </Kutija>
    </Ekran>
  );
}

export function SemaInstruktori() {
  return (
    <Ekran naslov="Instruktori" sirina="min-w-[600px]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Instruktori</span>
        <span className="flex items-center gap-1">
          <M n={1} />
          <Dugme ton="amber">+ Novi instruktor</Dugme>
        </span>
      </div>
      <Kutija className="flex flex-wrap items-end gap-2">
        <span className="font-semibold">Novi instruktor:</span>
        <Polje label="Ime" vrednost="Nataša" />
        <Polje label="Prezime" vrednost="Nešić" />
        <Polje label="Email (za prijavu)" vrednost="natasa@…" />
        <Polje label="Lozinka (min. 6 znakova)" vrednost="••••••" />
        <Dugme ton="amber">Kreiraj instruktora</Dugme>
      </Kutija>
      <Kutija className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-pink-500" /> <strong>Nataša Nešić</strong>
        </span>
        <span className="flex items-center gap-1">
          <M n={3} />
          <span className="rounded border border-stone-300 px-1.5 py-0.5">Suspenduj</span>
          <M n={2} />
          <span className="text-stone-500">Uredi</span>
          <M n={4} />
          <span className="font-medium text-amber-700">Pregled →</span>
        </span>
      </Kutija>
    </Ekran>
  );
}

export function SemaSifarnici() {
  return (
    <Ekran naslov="Vrste časova (isto izgledaju Kategorije, Programi i Učionice)" sirina="min-w-[600px]">
      <Kutija className="flex flex-wrap items-end gap-2">
        <M n="A" />
        <Polje label="Naziv" vrednost="Matematika" />
        <Polje label="Program *" vrednost="Defektološki" />
        <Polje label="Cena po času (RSD)" vrednost="1500" />
        <Polje label="Trajanje (min)" vrednost="45" />
        <Dugme ton="amber">Dodaj</Dugme>
      </Kutija>
      <Kutija className="flex items-center justify-between">
        <span>
          <strong>Matematika</strong> · 1.500 RSD · 45 min
        </span>
        <span className="flex items-center gap-1">
          <M n="B" />
          <span className="text-amber-700">Izmeni</span>
          <span className="text-stone-300">|</span>
          <span className="text-red-600">Obriši</span>
        </span>
      </Kutija>
    </Ekran>
  );
}

export function SemaDnevnik() {
  return (
    <Ekran naslov="Dnevnik aktivnosti" sirina="min-w-[560px]">
      <div className="flex flex-wrap items-end gap-1.5">
        <M n={2} />
        <Polje label="Pretraga" prazno="opis, ime, email, akcija…" />
        <Polje label="Ko" vrednost="svi" />
        <Polje label="Od" prazno="dd.mm.gggg." />
        <Polje label="Do" prazno="dd.mm.gggg." />
        <Dugme ton="amber">Filtriraj</Dugme>
      </div>
      <Kutija className="flex items-center gap-2">
        <M n={1} />
        <span className="text-stone-500">29.10. 16:20</span>
        <span className="rounded bg-amber-100 px-1 text-amber-800">Admin</span>
        <span>Uneta uplata (10 čas(ova), 13500 din).</span>
      </Kutija>
    </Ekran>
  );
}

export function SemaPodesavanja() {
  return (
    <Ekran naslov="Podešavanja" sirina="min-w-[520px]">
      <Kutija className="flex flex-wrap items-end gap-2">
        <M n={1} />
        <Polje label="Maksimalan broj časova (radionica) u jednom terminu" vrednost="4" />
        <Polje label="Maksimalan broj termina u jednom vremenskom slotu" vrednost="16" />
        <M n={2} />
        <Dugme ton="amber">Sačuvaj podešavanja</Dugme>
      </Kutija>
      <Kutija className="flex items-center gap-2">
        <M n={3} />
        <span className="font-semibold">Bekap baze</span>
        <Dugme ton="okvir">⬇ Preuzmi bekap baze (JSON)</Dugme>
      </Kutija>
    </Ekran>
  );
}
