'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import UplataForm from '@/app/admin/uplate/novi/UplataForm';
import ObrisiUplatuButton from '@/app/admin/uplate/ObrisiUplatuButton';

export type UplataKlijentaRow = {
  id: string;
  createdAt: string | null;
  iznos: number | null;
  brojCasova: number;
  popustPercent: number | null;
  napomena: string | null;
  primio: string | null;
  vrsta: string | null;
};

const formatDatum = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('sr-Latn-RS', { timeZone: 'Europe/Belgrade', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
const formatIznos = (n: number) => `${n.toLocaleString('sr-Latn-RS')} RSD`;

/** Istorija uplata deteta + unos nove uplate direktno sa profila (dete je već izabrano). */
export default function UplateKlijentaSection({
  client,
  uplate,
  instructors,
  termTypes,
}: {
  client: { id: string; ime: string; prezime: string; popust_percent: number };
  uplate: UplataKlijentaRow[];
  instructors: { id: string; ime: string; prezime: string }[];
  termTypes: { id: string; naziv: string; cena_po_casu: number | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ukupnoIznos = uplate.reduce((sum, u) => sum + (u.iznos ?? 0), 0);
  const ukupnoCasova = uplate.reduce((sum, u) => sum + u.brojCasova, 0);
  const imeDeteta = `${client.ime} ${client.prezime}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600 tabular-nums">
          Ukupno: <strong className="text-stone-900">{formatIznos(ukupnoIznos)}</strong> · {ukupnoCasova} plaćenih časova · {uplate.length} uplat
          {uplate.length === 1 ? 'a' : 'e'}
        </p>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            + Dodaj uplatu
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-stone-800">Nova uplata – {imeDeteta}</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-stone-500 hover:text-stone-700">
              Zatvori
            </button>
          </div>
          <UplataForm
            instructors={instructors}
            clients={[client]}
            termTypes={termTypes}
            fixedClientId={client.id}
            backHref={`/admin/klijenti/${client.id}`}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </div>
      )}

      {uplate.length === 0 ? (
        <p className="text-sm text-stone-500">Još nema unetih uplata za ovo dete.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 bg-stone-50">
              <tr>
                <th className="p-2.5 text-left font-medium text-stone-600">Datum</th>
                <th className="p-2.5 text-left font-medium text-stone-600">Vrsta</th>
                <th className="p-2.5 text-right font-medium text-stone-600">Br. časova</th>
                <th className="p-2.5 text-right font-medium text-stone-600">Iznos</th>
                <th className="p-2.5 text-left font-medium text-stone-600">Primio</th>
                <th className="p-2.5 text-left font-medium text-stone-600">Napomena</th>
                <th className="p-2.5 text-right font-medium text-stone-600">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {uplate.map((u) => (
                <tr key={u.id} className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50">
                  <td className="p-2.5 whitespace-nowrap text-stone-700 tabular-nums">{formatDatum(u.createdAt)}</td>
                  <td className="p-2.5 text-stone-700">{u.vrsta ?? '—'}</td>
                  <td className="p-2.5 text-right tabular-nums">{u.brojCasova}</td>
                  <td className="p-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                    {u.iznos != null ? formatIznos(u.iznos) : '—'}
                    {u.popustPercent ? <span className="ml-1 text-xs font-normal text-stone-500">(−{u.popustPercent}%)</span> : null}
                  </td>
                  <td className="p-2.5 text-stone-700">{u.primio ?? '—'}</td>
                  <td className="p-2.5 max-w-[200px] truncate text-stone-500" title={u.napomena ?? ''}>
                    {u.napomena ?? '—'}
                  </td>
                  <td className="p-2.5 text-right whitespace-nowrap">
                    <Link href={`/admin/uplate/${u.id}`} className="font-medium text-amber-700 hover:text-amber-800">
                      Izmeni
                    </Link>
                    <span className="mx-1.5 text-stone-300">|</span>
                    <ObrisiUplatuButton
                      id={u.id}
                      opis={`${u.iznos != null ? formatIznos(u.iznos) : 'bez iznosa'} za ${imeDeteta} (${u.brojCasova} čas.)`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
