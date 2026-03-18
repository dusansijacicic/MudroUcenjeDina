'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import toast from 'react-hot-toast';

const ERROR_MESSAGES: Record<string, string> = {
  term: 'Greška pri kreiranju termina. Pokušajte ponovo.',
  slot_pun: 'U ovom terminu je već dostignut maksimalan broj termina. Izaberite drugi datum ili vreme.',
  max_predavanja: 'Ovaj termin već ima maksimalan broj časova. Ne možete dodati novo predavanje.',
};

export default function DashboardErrorToast() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const error = searchParams.get('error');
    const message = searchParams.get('message');
    if (!error && !message) return;
    const text = message ? decodeURIComponent(message) : (ERROR_MESSAGES[error ?? ''] ?? 'Došlo je do greške.');
    toast.error(text, { id: 'dashboard-error' });
    const next = new URLSearchParams(searchParams);
    next.delete('error');
    next.delete('message');
    const q = next.toString();
    router.replace(q ? `/dashboard?${q}` : '/dashboard', { scroll: false });
  }, [searchParams, router]);

  return null;
}
