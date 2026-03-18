'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteClassroom } from '@/app/admin/actions';

export default function DeleteClassroomButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Obrisati ovu učionicu? Ako postoje termini vezani za nju, dobićete grešku.')) return;
    setLoading(true);
    const res = await deleteClassroom(id);
    setLoading(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="text-xs text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-2 py-1"
    >
      Obriši
    </button>
  );
}

