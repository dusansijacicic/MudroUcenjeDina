'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { setInstructorAktivanAsAdmin } from '@/app/admin/actions';

export default function InstructorAktivanToggle({ id, aktivan }: { id: string; aktivan: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    const next = !aktivan;
    if (!next && !confirm('Suspendovati ovog instruktora? Neće se više nuditi za zakazivanje/dodelu novog posla (istorija ostaje netaknuta).')) {
      return;
    }
    setLoading(true);
    const res = await setInstructorAktivanAsAdmin(id, next);
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(next ? 'Instruktor aktiviran.' : 'Instruktor suspendovan.');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`text-sm shrink-0 ui-transition disabled:opacity-50 ${
        aktivan ? 'text-stone-500 hover:text-red-600' : 'text-emerald-600 hover:text-emerald-700 font-medium'
      }`}
    >
      {aktivan ? 'Suspenduj' : 'Aktiviraj'}
    </button>
  );
}
