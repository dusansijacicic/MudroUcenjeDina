'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { deleteClientAsAdmin } from '@/app/admin/actions';

export default function AdminDeleteClientButton({
  clientId,
  clientLabel,
}: {
  clientId: string;
  clientLabel: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    const ok = window.confirm(
      `Trajno obrisati klijenta „${clientLabel}” iz sistema?\n\n` +
        'Biće uklonjene sve radionice, veze sa instruktorima, uplate i zahtevi vezani za ovog klijenta. Ova radnja se ne može poništiti.'
    );
    if (!ok) return;

    setLoading(true);
    try {
      const result = await deleteClientAsAdmin(clientId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Klijent obrisan.');
      router.push('/admin/klijenti');
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Greška pri brisanju.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
    >
      {loading ? 'Brisanje...' : 'Obriši klijenta iz sistema'}
    </button>
  );
}
