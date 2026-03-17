# Kako pokrenuti SQL u Supabase-u

SQL fajlovi iz projekta **ne pokreću se automatski**. Morate ih ručno izvršiti u Supabase Dashboardu.

## Koraci

1. **Otvori Supabase**  
   Uloguj se na [supabase.com](https://supabase.com) i izaberi svoj projekat.

2. **Otvori SQL Editor**  
   U levom meniju klikni na **SQL Editor** (ikona </>).

3. **Pokreni migracije redom** – svaku u **novoj** query kartici:

   ### Prva migracija (001)
   - Klikni **+ New query**.
   - Otvori fajl `supabase/migrations/001_initial.sql` iz ovog projekta.
   - Kopiraj **ceo sadržaj** (Ctrl+A, Ctrl+C) i nalepi u SQL Editor (Ctrl+V).
   - Klikni **Run** (ili Ctrl+Enter).
   - Na dnu treba da piše da je upit uspešno izvršen (zeleno). Ako piše greška, proveri da li si već ranije pokrenuo ovu migraciju (tabele već postoje).

   ### Druga migracija (002)
   - Ponovo **+ New query**.
   - Kopiraj ceo sadržaj iz `supabase/migrations/002_predavanja_i_ucenik.sql`.
   - Nalepi u editor i klikni **Run**.
   - **Napomena:** 002 menja strukturu (dodaje predavanja, itd.). Pokreći **samo ako ste već pokrenuli 001**.

   ### Treća migracija (003)
   - Ponovo **+ New query**.
   - Kopiraj ceo sadržaj iz `supabase/migrations/003_instructor_color.sql`.
   - Nalepi i **Run**.

4. **Provera**  
   U levom meniju otvori **Table Editor**. Trebalo bi da vidiš tabele: `instructors`, `clients`, `terms`, `predavanja`. Ako ih nema, vrati se na korak 3 i pokreni 001 (pa 002, pa 003).

---

**Rezime:** Sve tri migracije se izvršavaju **u Supabase-u**, u **SQL Editor** prozoru, jednu za drugom. Ne treba ništa pokretati u terminalu za SQL.
