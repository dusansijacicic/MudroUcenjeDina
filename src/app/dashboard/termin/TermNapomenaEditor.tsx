'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { updateTermNapomenaAsInstructor } from '@/app/dashboard/termin/actions';

export default function TermNapomenaEditor({
  termId,
  initialNapomena,
}: {
  termId: string;
  initialNapomena: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialNapomena ?? '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setText(initialNapomena ?? '');
  }, [initialNapomena]);

  const save = async () => {
    setLoading(true);
    const res = await updateTermNapomenaAsInstructor(termId, text.trim() || null);
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Napomena za termin je sačuvana.');
    router.refresh();
  };

  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/90 p-3 space-y-2">
      <div>
        <label htmlFor={`term-nap-${termId}`} className="block text-xs font-medium text-stone-700 mb-1">
          Napomena za termin
        </label>
        <p className="text-xs text-stone-500 mb-2">
          Interna napomena – istu mogu unositi i vi i admin (u admin panelu).
        </p>
        <textarea
          id={`term-nap-${termId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
          placeholder="Opciono: napomena za ovaj termin..."
        />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={loading}
        className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? 'Čuvanje...' : 'Sačuvaj napomenu'}
      </button>
    </div>
  );
}
