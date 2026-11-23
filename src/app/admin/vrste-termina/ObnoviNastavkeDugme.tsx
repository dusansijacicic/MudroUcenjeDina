'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { obnoviNastavkeAsAdmin } from '@/app/admin/actions';

type Sukob = { termId: string; datum: string; vreme: string; dete: string };

/**
 * Za sve buduće časove: časovi duži od 45 min dobijaju „Nastavak dužeg časa“ u sledećem bloku (npr. posle
 * promene trajanja vrste sa 45 na 55 min). Prikazuje časove kojima nastavak ne može da stane.
 */
export default function ObnoviNastavkeDugme() {
  const [radi, setRadi] = useState(false);
  const [sukobi, setSukobi] = useState<Sukob[] | null>(null);

  const obnovi = async () => {
    setRadi(true);
    try {
      const res = await obnoviNastavkeAsAdmin();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setSukobi(res.sukobi ?? []);
      toast.success(`Provereno ${res.obradjeno ?? 0} budućih termina.`);
    } finally {
      setRadi(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-stone-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={obnovi}
          disabled={radi}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        >
          {radi ? 'Proveravam časove…' : 'Obnovi nastavke dužih časova'}
        </button>
        <span className="text-stone-500">
          Svi budući časovi duži od 45 min (npr. 55 ili 90 min) dobijaju „Nastavak dužeg časa“ u sledećem bloku. Radi se i samo kad
          promenite trajanje vrste.
        </span>
      </div>
      {sukobi && (
        sukobi.length === 0 ? (
          <p className="mt-3 text-emerald-700">✓ Svi duži časovi imaju nastavak.</p>
        ) : (
          <div className="mt-3">
            <p className="font-medium text-amber-800">
              {sukobi.length} časova nema mesta za nastavak – instruktor ili učionica u sledećem bloku već imaju drugi čas. Premestite
              jedan od ta dva časa:
            </p>
            <ul className="mt-1 list-disc pl-5 text-stone-700">
              {sukobi.map((s) => (
                <li key={s.termId}>
                  <a href={`/admin/termin/${s.termId}`} className="text-amber-700 hover:underline">
                    {s.datum} {s.vreme}
                  </a>{' '}
                  – {s.dete}
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
