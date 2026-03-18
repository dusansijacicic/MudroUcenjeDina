'use client';

import { useRouter } from 'next/navigation';
import { deleteTermTypeAsAdmin } from '@/app/admin/actions';

export default function DeleteTermTypeButton({ id }: { id: string }) {
  const router = useRouter();

  const handleClick = async () => {
    if (!confirm('Obrisati vrstu?')) return;
    const result = await deleteTermTypeAsAdmin(id);
    if (result.error) {
      alert(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-sm text-red-600 hover:text-red-700"
    >
      Obriši
    </button>
  );
}
