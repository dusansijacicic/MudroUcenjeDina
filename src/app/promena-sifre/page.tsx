'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

export default function PromenaSifrePage() {
  const router = useRouter();
  const [trenutna, setTrenutna] = useState('');
  const [nova, setNova] = useState('');
  const [potvrda, setPotvrda] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/login?reason=no_session');
        return;
      }
      setReady(true);
    });
  }, [supabase.auth, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nova.length < 6) {
      toast.error('Nova lozinka mora imati najmanje 6 karaktera.');
      return;
    }
    if (nova !== potvrda) {
      toast.error('Nova lozinka i potvrda se ne poklapaju.');
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        toast.error('Niste ulogovani.');
        setLoading(false);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: trenutna,
      });
      if (signInError) {
        toast.error('Trenutna lozinka nije ispravna.');
        setLoading(false);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: nova });
      if (updateError) {
        toast.error(updateError.message || 'Greška pri promeni lozinke.');
        setLoading(false);
        return;
      }
      toast.success('Lozinka je uspešno promenjena.');
      setTrenutna('');
      setNova('');
      setPotvrda('');
      router.refresh();
    } catch (err) {
      toast.error('Greška. Pokušajte ponovo.');
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-stone-500">Učitavanje...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-stone-200 shadow-lg p-6">
        <h1 className="text-xl font-semibold text-stone-800 mb-1">Promena lozinke</h1>
        <p className="text-sm text-stone-500 mb-6">
          Unesite trenutnu lozinku i novu lozinku (min. 6 karaktera).
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="trenutna" className="block text-sm font-medium text-stone-700 mb-1">
              Trenutna lozinka
            </label>
            <input
              id="trenutna"
              type="password"
              value={trenutna}
              onChange={(e) => setTrenutna(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-stone-800 focus:ring-2 focus:ring-amber-400 focus:border-amber-500"
            />
          </div>
          <div>
            <label htmlFor="nova" className="block text-sm font-medium text-stone-700 mb-1">
              Nova lozinka
            </label>
            <input
              id="nova"
              type="password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-stone-800 focus:ring-2 focus:ring-amber-400 focus:border-amber-500"
            />
          </div>
          <div>
            <label htmlFor="potvrda" className="block text-sm font-medium text-stone-700 mb-1">
              Potvrdi novu lozinku
            </label>
            <input
              id="potvrda"
              type="password"
              value={potvrda}
              onChange={(e) => setPotvrda(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-stone-800 focus:ring-2 focus:ring-amber-400 focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-600 text-white font-medium py-3 hover:bg-amber-700 focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Sačekajte...' : 'Promeni lozinku'}
          </button>
        </form>

        <p className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-amber-700 hover:underline"
          >
            ← Nazad
          </button>
        </p>
        <p className="mt-2 text-center text-stone-400 text-xs">
          Kalendar: <Link href="/dashboard" className="hover:underline">predavač</Link>
          <span className="mx-1">·</span>
          <Link href="/admin" className="hover:underline">admin</Link>
          <span className="mx-1">·</span>
          <Link href="/ucenik" className="hover:underline">učenik</Link>
        </p>
      </div>
    </div>
  );
}
