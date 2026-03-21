'use client';

import { useRouter } from 'next/navigation';
import { deleteTermCategoryAsAdmin } from '@/app/admin/actions';

export default function DeleteTermCategoryButton({ id }: { id: string }) {
  const router = useRouter();

  const handleClick = async () => {
    if (!confirm('Obrisati kategoriju?')) return;
    const result = await deleteTermCategoryAsAdmin(id);
    if (result.error) {
      alert(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <button type="button" onClick={handleClick} className="text-sm text-red-600 hover:text-red-700">
      Obriši
    </button>
  );
}
