'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { unblockSlotAsAdmin } from '@/app/admin/actions';

export default function UnblockButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirm('Odblokirati ovaj termin? Ponovo će moći da se zakazuje.')) return;
    setLoading(true);
    const res = await unblockSlotAsAdmin(id);
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Termin odblokiran.');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-stone-500 hover:text-red-600 disabled:opacity-50"
    >
      Odblokiraj
    </button>
  );
}
