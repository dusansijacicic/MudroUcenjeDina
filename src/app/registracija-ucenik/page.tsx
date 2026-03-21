'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

export default function RegistracijaUcenikPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [datumTestiranja, setDatumTestiranja] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (signUpError) throw signUpError;
      if (data.user) {
        await supabase.rpc('link_client_to_user');
      }
      router.push('/ucenik');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Greška pri registraciji.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg border border-stone-200 p-8">
        <h1 className="text-2xl font-semibold text-stone-800 text-center mb-2">
          Registracija učenika
        </h1>
        <p className="text-stone-500 text-center text-sm mb-6">
          Unesite email koji vam je dao instruktor i izaberite lozinku. Posle toga
          možete da vidite svoje časove i šta je rađeno.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Email (isti kao kod instruktora)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Lozinka
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Datum testiranja <span className="text-stone-400 font-normal">(opciono)</span>
            </label>
            <input
              type="date"
              value={datumTestiranja}
              onChange={(e) => setDatumTestiranja(e.target.value)}
              className="w-full max-w-[220px] rounded-lg border border-stone-300 px-3 py-2 text-stone-800 focus:ring-2 focus:ring-amber-500"
            />
            <p className="mt-1 text-xs text-stone-500">
              Ako znate datum testiranja, unesite ga ovde. Može i kasnije da ga doda instruktor u vašem profilu.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-600 text-white font-medium py-2.5 hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? 'Registrujem...' : 'Registruj se'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-stone-500">
          <Link href="/login" className="text-amber-700 hover:underline">
            ← Nazad na prijavu
          </Link>
        </p>
      </div>
    </div>
  );
}
