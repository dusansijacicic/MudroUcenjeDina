# Besplatno hostovanje – Dina Kalendar

Aplikacija se može besplatno hostovati koristeći **Vercel** (frontend) i **Supabase** (baza + prijava).

## 1. Supabase (baza i prijava)

1. Idi na [supabase.com](https://supabase.com) i napravi besplatan nalog.
2. **New project** – izaberi organizaciju, ime projekta, lozinku za bazu (sačuvaj je).
3. Kad projekat bude spreman: **Project Settings** → **API**:
   - **Project URL** → to je `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → to je `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **SQL Editor** → New query. Pokreni redom (detaljno: vidi **KAKO_POKRENUTI_SQL.md**):
   - ceo sadržaj `supabase/migrations/001_initial.sql` (tabele, RLS);
   - zatim `supabase/migrations/002_predavanja_i_ucenik.sql` (predavanja, učenik, login_email);
   - zatim `supabase/migrations/003_instructor_color.sql` (boja predavača).
5. (Opciono) **Authentication** → **Providers** – možeš ostaviti Email kao glavni način prijave. Ako želiš da korisnici odmah ulaze bez potvrde emaila, u **Email** možeš isključiti "Confirm email".

## 2. Lokalno pokretanje

1. U root folderu projekta kopiraj `.env.local.example` u `.env.local`.
2. U `.env.local` unesi svoje `NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_ANON_KEY` iz Supabase.
3. Pokretanje:
   ```bash
   npm install
   npm run dev
   ```
4. Otvori [http://localhost:3000](http://localhost:3000), klikni „Registrujte se” i napravi prvog predavača.

## 3. Vercel (hosting aplikacije)

1. Otvori [vercel.com](https://vercel.com) i uloguj se (npr. preko GitHub-a).
2. **Add New** → **Project** i izaberi repozitorijum sa ovim kodom (ili **Import** pa upload).
3. U **Environment Variables** dodaj:
   - `NEXT_PUBLIC_SUPABASE_URL` = tvoj Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = tvoj Supabase anon key
4. **Deploy**. Vercel će dati link tipa `tvoj-projekat.vercel.app`.

## 4. Redirect za Supabase (nakon deploya)

Da bi prijava radila na produkciji:

1. U Supabase: **Authentication** → **URL Configuration**.
2. **Site URL** postavi na svoj Vercel URL (npr. `https://tvoj-projekat.vercel.app`).
3. U **Redirect URLs** dodaj: `https://tvoj-projekat.vercel.app/auth/callback`.

---

**Rezultat:** aplikacija je na besplatnom domenu (Vercel), baza i auth na Supabase free tieru.

- **Predavači:** registracija, kalendar (dan / nedelja / mesec), više predavanja u jednom terminu, klijenti, izmena predavanja.
- **Učenici:** predavač unosi „Email za prijavu učenika” kod klijenta; učenik ide na „Registracija učenika” i registruje se tim emailom, pa na **Moj pregled** vidi svoje časove, plaćeno/održano i šta je sve rađeno.
