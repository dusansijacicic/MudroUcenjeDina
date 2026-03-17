'use client';

import Link from 'next/link';

export default function AddTermButton({ instructorId }: { instructorId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Link
      href={`/dashboard/termin/novi?date=${today}&slot=0`}
      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
    >
      Novi termin
    </Link>
  );
}
