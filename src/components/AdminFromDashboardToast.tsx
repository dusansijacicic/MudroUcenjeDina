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
      toast('Kao admin prvo izaberite predavača da biste videli kalendar.', {
        icon: '👤',
        id: 'admin-from-dashboard',
      });
    }
  }, [from]);
  return null;
}
