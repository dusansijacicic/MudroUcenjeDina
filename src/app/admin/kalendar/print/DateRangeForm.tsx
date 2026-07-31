'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DateRangeForm({
  initialFrom,
  initialTo,
}: {
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/admin/kalendar/print?from=${from}&to=${to}`);
  };

  return (
    <form onSubmit={submit} className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-3">
      <div>
        <label className="block text-xs font-medium text-stone-700 mb-1">Od</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-700 mb-1">Do</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
        />
      </div>
      <button
        type="submit"
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
      >
        Prikaži
      </button>
    </form>
  );
}
