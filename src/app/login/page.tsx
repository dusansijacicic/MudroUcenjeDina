'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [ime, setIme] = useState('');
  const [prezime, setPrezime] = useState('');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        });
        if (signUpError) throw signUpError;
        if (data.user) {
          const { error: profileError } = await supabase.from('instructors').insert({
            user_id: data.user.id,
            ime: ime.trim(),
            prezime: prezime.trim(),
            email: email.trim(),
          });
          if (profileError) throw profileError;
        }
        router.push('/dashboard');
        router.refresh();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) {
          const { data: inst } = await supabase.from('instructors').select('id').eq('user_id', u.id).single();
          const { data: cl } = await supabase.from('clients').select('id').eq('user_id', u.id).single();
          if (inst) router.push('/dashboard');
          else if (cl) router.push('/ucenik');
          else router.push('/dashboard');
        } else {
          router.push('/dashboard');
        }
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Greška pri prijavi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg border border-stone-200 p-8">
        <h1 className="text-2xl font-semibold text-stone-800 text-center mb-2">
          Dina Kalendar
        </h1>
        <p className="text-stone-500 text-center text-sm mb-6">
          Prijava (predavač ili učenik)
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Ime
                </label>
                <input
                  type="text"
                  value={ime}
                  onChange={(e) => setIme(e.target.value)}
                  required={isSignUp}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Prezime
                </label>
                <input
                  type="text"
                  value={prezime}
                  onChange={(e) => setPrezime(e.target.value)}
                  required={isSignUp}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
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
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-600 text-white font-medium py-2.5 hover:bg-amber-700 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Sačekajte...' : isSignUp ? 'Registracija (predavač)' : 'Prijava'}
          </button>
        </form>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp((v) => !v);
              setError('');
            }}
            className="w-full text-sm text-amber-700 hover:text-amber-800"
          >
            {isSignUp ? 'Već imate nalog? Prijavite se' : 'Predavač? Registrujte se ovde'}
          </button>
          {!isSignUp && (
            <p className="text-center text-sm text-stone-500">
              Učenik?{' '}
              <Link href="/registracija-ucenik" className="text-amber-700 hover:underline">
                Registracija učenika
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
