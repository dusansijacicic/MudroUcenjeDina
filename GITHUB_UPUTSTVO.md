# Kako dodati projekat na GitHub

## 1. Instaliraj Git (ako ga nemaš)

- Preuzmi: **https://git-scm.com/download/win**
- Instaliraj (zadržavaj podrazumevane opcije).
- Zatvori i ponovo otvori Cursor/terminal da se ažurira PATH.

## 2. Kreiraj repozitorijum na GitHub-u

1. Uloguj se na **https://github.com**
2. Klikni **+** (gore desno) → **New repository**
3. **Repository name:** npr. `dina-kalendar`
4. Ostavi **Public**, ne čekiraj "Add a README" (projekat već ima fajlove).
5. Klikni **Create repository**

## 3. U terminalu (u folderu projekta)

Otvori terminal u folderu **Dina kalendar** (Cursor: Terminal → New Terminal, ili `cd` do tog foldera).

Zatim uradi redom:

```bash
git init
git add .
git commit -m "Prva verzija Dina Kalendar - Next.js, Supabase"
```

Ako GitHub repozitorijum nema ništa (prazan), nastavi sa:

```bash
git branch -M main
git remote add origin https://github.com/dusansijacicic/MudroUcenjeDina.git
git push -u origin main
```

**Tvoj repozitorijum:** [github.com/dusansijacicic/MudroUcenjeDina](https://github.com/dusansijacicic/MudroUcenjeDina)

---

## Važno

- Fajl **`.env.local`** se ne šalje na GitHub (već je u `.gitignore`). Na novom računaru ili na Vercel-u moraš ručno dodati env varijable (vidi HOSTING.md).
- Lozinke i API ključevi ne smeju u repozitorijum – zato ih držimo u `.env.local`.
