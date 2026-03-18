'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const REASON_MESSAGES: Record<string, string> = {
  no_session: 'Sesija nije pronađena ili je istekla. Ulogujte se ponovo.',
  not_authorized: 'Niste ovlašćeni za tu stranicu.',
  no_instructor: 'Za ovaj nalog nije pronađen predavač. Dodajte se u admin_users ili kao predavač.',
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [ime, setIme] = useState('');
  const [prezime, setPrezime] = useState('');

  const supabase = createClient();

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason && REASON_MESSAGES[reason]) {
      toast.error(REASON_MESSAGES[reason], { id: 'login-reason' });
    }
  }, [searchParams]);

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
        toast.success('Registracija uspešna. Preusmeravanje na dashboard...');
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
          const { data: adm } = await supabase.from('admin_users').select('user_id').eq('user_id', u.id).single();
          if (adm) {
            toast.success('Prijava uspešna (admin). Preusmeravanje...');
            router.push('/admin');
          } else {
            const { data: inst } = await supabase.from('instructors').select('id').eq('user_id', u.id).single();
            const { data: cl } = await supabase.from('clients').select('id').eq('user_id', u.id).single();
            if (inst) {
              toast.success('Prijava uspešna. Preusmeravanje na kalendar...');
              router.push('/dashboard');
            } else if (cl) {
              toast.success('Prijava uspešna. Preusmeravanje na Moj pregled...');
              router.push('/ucenik');
            } else {
              toast('Nalog nije povezan ni sa predavačem ni sa učenikom.', { icon: '⚠️' });
              router.push('/dashboard');
            }
          }
        } else {
          toast.success('Prijava uspešna. Preusmeravanje...');
          router.push('/dashboard');
        }
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Greška pri prijavi.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--kid-butter)] via-[var(--kid-sky)]/40 to-[var(--kid-peach)]/50 px-4 py-8">
      <div className="w-full max-w-sm rounded-3xl bg-white/95 backdrop-blur-sm shadow-xl border-2 border-white/60 p-8 animate-scale-in">
        <h1 className="text-2xl font-bold text-center mb-2 text-[var(--kid-text)]">
          Dina Kalendar
        </h1>
        <p className="text-[var(--kid-text-muted)] text-center text-sm mb-6">
          Prijava (predavač ili učenik)
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-[var(--kid-text)] mb-1">
                  Ime
                </label>
                <input
                  type="text"
                  value={ime}
                  onChange={(e) => setIme(e.target.value)}
                  required={isSignUp}
                  className="w-full rounded-xl border-2 border-[var(--kid-sky-dark)]/40 px-3 py-2.5 text-[var(--kid-text)] focus:ring-2 focus:ring-[var(--kid-teal)] focus:border-[var(--kid-teal)] transition-smooth"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--kid-text)] mb-1">
                  Prezime
                </label>
                <input
                  type="text"
                  value={prezime}
                  onChange={(e) => setPrezime(e.target.value)}
                  required={isSignUp}
                  className="w-full rounded-xl border-2 border-[var(--kid-sky-dark)]/40 px-3 py-2.5 text-[var(--kid-text)] focus:ring-2 focus:ring-[var(--kid-teal)] focus:border-[var(--kid-teal)] transition-smooth"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-[var(--kid-text)] mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border-2 border-[var(--kid-sky-dark)]/40 px-3 py-2.5 text-[var(--kid-text)] focus:ring-2 focus:ring-[var(--kid-teal)] focus:border-[var(--kid-teal)] transition-smooth"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--kid-text)] mb-1">
              Lozinka
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border-2 border-[var(--kid-sky-dark)]/40 px-3 py-2.5 text-[var(--kid-text)] focus:ring-2 focus:ring-[var(--kid-teal)] focus:border-[var(--kid-teal)] transition-smooth"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0d9488] text-white font-semibold py-3 hover:bg-[#0f766e] focus:ring-2 focus:ring-[var(--kid-teal)] focus:ring-offset-2 disabled:opacity-50 transition-smooth hover-lift"
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
            className="w-full text-sm text-[#0d9488] hover:text-[#0f766e] font-medium transition-smooth"
          >
            {isSignUp ? 'Već imate nalog? Prijavite se' : 'Predavač? Registrujte se ovde'}
          </button>
          {!isSignUp && (
            <p className="text-center text-sm text-[var(--kid-text-muted)]">
              Učenik?{' '}
              <Link href="/registracija-ucenik" className="text-[#0d9488] hover:underline font-medium">
                Registracija učenika
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
