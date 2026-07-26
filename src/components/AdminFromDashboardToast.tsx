'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';

export default function AdminFromDashboardToast({
  from,
}: {
  from: string | string[] | undefined;
}) {
  useEffect(() => {
    if (from === 'dashboard') {
      toast('Prijavljeni ste kao admin — ovo je kalendar svih instruktora.', {
        icon: '👤',
        id: 'admin-from-dashboard',
      });
    }
  }, [from]);
  return null;
}
