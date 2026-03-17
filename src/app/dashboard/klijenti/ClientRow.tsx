'use client';

import Link from 'next/link';
import type { Client } from '@/types/database';

export default function ClientRow({ client }: { client: Client }) {
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
      <td className="p-3 text-stone-600">{client.godiste ?? '—'}</td>
      <td className="p-3 text-stone-600">{client.razred ?? '—'}</td>
      <td className="p-3 text-stone-600">{client.skola ?? '—'}</td>
      <td className="p-3 text-stone-600">
        <div>{client.roditelj ?? '—'}</div>
        {client.kontakt_telefon && (
          <div className="text-stone-500">{client.kontakt_telefon}</div>
        )}
      </td>
      <td className="p-3 text-right font-medium text-stone-700">
        {client.placeno_casova}
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
