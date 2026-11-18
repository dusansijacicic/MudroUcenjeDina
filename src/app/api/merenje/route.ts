import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Prijem merenja iz pregledača (components/MerenjeBrzine) → jedan red u Vercel Logs:
 *   [merenje] akcija 640ms | /admin/kalendar | dugme „✓ Potvrdi plaćeno (2)“ · prvi odgovor 410ms
 *   [merenje] učitavanje 1800ms SPORO | /admin/klijenti · server 1200ms
 * Samo za prijavljene korisnike; MERENJE=0 isključuje.
 */

const CILJ_MS = 500;
const NAZIVI: Record<string, string> = {
  ucitavanje: 'učitavanje',
  prelaz: 'prelaz',
  osvezavanje: 'osvežavanje',
  akcija: 'akcija',
};

const prazno = () => new NextResponse(null, { status: 204 });

function broj(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(Math.min(v, 600_000)) : null;
}

function tekst(v: unknown, n: number): string {
  return typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, n) : '';
}

export async function POST(request: Request) {
  if (process.env.MERENJE === '0') return prazno();

  // Prijava se proverava lokalno (JWT iz kolačića) – bez poziva ka bazi.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return prazno();

  let p: Record<string, unknown>;
  try {
    p = JSON.parse((await request.text()).slice(0, 4000)) as Record<string, unknown>;
  } catch {
    return prazno();
  }
  const naziv = NAZIVI[tekst(p.vrsta, 20)];
  const ms = broj(p.ms);
  if (!naziv || ms === null) return prazno();

  const detalji = [
    tekst(p.dugme, 60) ? `dugme „${tekst(p.dugme, 60)}“` : '',
    broj(p.server) !== null ? `server ${broj(p.server)}ms` : '',
    broj(p.prviOdgovor) !== null ? `prvi odgovor ${broj(p.prviOdgovor)}ms` : '',
    broj(p.status) && broj(p.status) !== 200 ? `status ${broj(p.status)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  console.log(`[merenje] ${naziv} ${ms}ms${ms > CILJ_MS ? ' SPORO' : ''} | ${tekst(p.putanja, 200) || '?'}${detalji ? ` | ${detalji}` : ''}`);
  return prazno();
}
