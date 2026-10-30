'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { TIME_SLOTS } from '@/lib/constants';
import { postaviPlacenePakete } from '@/app/admin/actions';

export type PaketKlijentaRow = { id: string; vrsta: string | null; odDatum: string; odSlot: number; brojCasova: number; createdAt: string | null };

function getMonday(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

/** Oznake „plaćeno od ovog časa“ za jedno dete (mod Označi plaćeno na kalendaru) – sa uklanjanjem. */
export default function PlaceniPaketiSection({ paketi }: { paketi: PaketKlijentaRow[] }) {
  const router = useRouter();
  const [brisem, setBrisem] = useState<string | null>(null);

  const ukloni = async (p: PaketKlijentaRow) => {
    const kada = `${new Date(`${p.odDatum}T12:00:00`).toLocaleDateString('sr-Latn-RS')} ${TIME_SLOTS[p.odSlot] ?? ''}`;
    if (!confirm(`Ukloniti oznaku „plaćeno od ${kada}“${p.vrsta ? ` (${p.vrsta})` : ''}? Tih ${p.brojCasova} časova više neće biti plaćeno.`)) return;
    setBrisem(p.id);
    const res = await postaviPlacenePakete([], [p.id]);
    setBrisem(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Oznaka plaćeno je uklonjena.');
    router.refresh();
  };

  if (paketi.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        Još nije označeno plaćanje. Na kalendaru uključite <strong>Označi plaćeno</strong> i kliknite dete u terminu od kog je plaćeno.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
      {paketi.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
          <Link
            href={`/admin/kalendar?view=nedelja&week=${getMonday(p.odDatum)}&fokus=${p.odDatum}&slot=${p.odSlot}`}
            className="font-medium capitalize text-stone-800 hover:text-amber-700 hover:underline"
          >
            od {new Date(`${p.odDatum}T12:00:00`).toLocaleDateString('sr-Latn-RS', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}{' '}
            {TIME_SLOTS[p.odSlot] ?? ''}
          </Link>
          <span className="rounded bg-amber-50 px-1.5 text-xs font-medium text-amber-800">{p.vrsta ?? 'Bez vrste'}</span>
          <span className="tabular-nums text-stone-600">{p.brojCasova} časova</span>
          {p.createdAt && (
            <span className="text-xs text-stone-400">
              označeno {new Date(p.createdAt).toLocaleDateString('sr-Latn-RS', { timeZone: 'Europe/Belgrade' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => ukloni(p)}
            disabled={brisem === p.id}
            className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {brisem === p.id ? 'Uklanjam…' : 'Ukloni'}
          </button>
        </li>
      ))}
    </ul>
  );
}
