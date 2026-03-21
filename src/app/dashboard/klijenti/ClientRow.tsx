'use client';

import Link from 'next/link';
import type { Client } from '@/types/database';
import type { StanjeVrsta } from './page';

export default function ClientRow({
  client,
  stanjePoVrstama = [],
}: {
  client: Client & { placeno_casova?: number };
  stanjePoVrstama?: StanjeVrsta[];
}) {
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50/50">
      <td className="p-3">
        <Link
          href={`/dashboard/klijenti/${client.id}`}
          className="font-medium text-amber-700 hover:text-amber-800"
        >
          {client.ime} {client.prezime}
        </Link>
      </td>
      <td className="p-3 text-stone-600 whitespace-nowrap">
        {client.datum_testiranja
          ? new Date(client.datum_testiranja + 'T12:00:00').toLocaleDateString('sr-Latn-RS')
          : '—'}
      </td>
      <td className="p-3 text-stone-600">{client.godiste ?? '—'}</td>
      <td className="p-3 text-stone-600">{client.razred ?? '—'}</td>
      <td className="p-3 text-stone-600">{client.skola ?? '—'}</td>
      <td className="p-3 text-stone-600">
        <div>{client.roditelj ?? '—'}</div>
        {client.kontakt_telefon && (
          <div className="text-stone-500">{client.kontakt_telefon}</div>
        )}
      </td>
      <td className="p-3 text-stone-600">
        {stanjePoVrstama.length === 0 ? (
          <span className="text-stone-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {stanjePoVrstama.map((s) => (
              <span key={s.term_type_naziv} className="whitespace-nowrap">
                <span className="font-medium text-stone-700">{s.term_type_naziv}:</span>{' '}
                <span>{s.uplaceno} plaćeno</span>
                <span className="text-stone-400 mx-0.5">/</span>
                <span>{s.odrzano} održano</span>
                <span className="text-stone-400 mx-0.5">/</span>
                <span className="text-amber-700 font-medium">{s.ostalo} preostalo</span>
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="p-3 text-right font-medium text-stone-700">
        {client.placeno_casova ?? 0}
      </td>
      <td className="p-3">
        <Link
          href={`/dashboard/klijenti/${client.id}`}
          className="text-amber-600 hover:text-amber-700 text-sm"
        >
          Izmeni
        </Link>
      </td>
    </tr>
  );
}
