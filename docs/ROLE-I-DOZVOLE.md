# Uloge i dozvole u aplikaciji

Aplikacija ima **3 osnovne uloge**. Dozvole su definisane ispod.

---

## 1. Super admin

- **Sve entitete** može da **dodaje / menja / briše**.
- Može da **zakaže predavanje za bilo kog predavača** (ne samo za sebe).
- **Jedini** može da **doda novog predavača**.
- Može da **dodaje klijente** (i povezuje ih sa predavačima).
- Vidi **sve termine** u sistemu i može da **menja i briše bilo koji termin** i bilo koju operaciju u aplikaciji.

---

## 2. Predavač

- Može da **dodaje nove klijente** (klijenti su potencijalno dostupni svim predavačima za zakazivanje).
- Pri zakazivanju termina:
  - može da **zakaže termin samo za sebe** i da **upravlja samo svojim terminima**;
  - bira **time slot** pod uslovom da je **slobodan**.
- U **kalendaru** vidi **sve zakazane časove** (uključujući od drugih predavača), ali **ne može** da ih menja niti da bilo kako operiše njima – samo pregled.

---

## 3. Klijent (učenik)

- Može da vidi **samo svoj raspored** – časove koji su zakazani **za njega**.
- Može da vidi **po predavaču kada je koji predavač slobodan** u narednih **nedelju dana**; na osnovu toga može da **pošalje zahtev za termin** kod nekog od predavača (dalje nije moguće zakazivanje bez predavača).
- Može da ima **uvid u informacije o svim svojim terminima**: šta je radjeno po časovima, kada je koji održan i šta je radjeno na njemu.

---

## Rezime

| Akcija | Super admin | Predavač | Klijent |
|--------|-------------|----------|---------|
| Dodaj predavača | ✅ | ❌ | ❌ |
| Dodaj klijenta | ✅ | ✅ | ❌ |
| Obriši klijenta iz sistema (trajno) | ✅ | ❌ | ❌ |
| Zakaži termin za bilo kog predavača | ✅ | ❌ | ❌ |
| Zakaži termin za sebe (samo svoj) | ✅ | ✅ | ❌ |
| Menja/briše bilo koji termin | ✅ | ❌ | ❌ |
| Menja/briše samo svoje termine | — | ✅ | ❌ |
| Vidi sve termine (samo pregled) | ✅ | ✅ | ❌ |
| Vidi samo svoje časove | — | — | ✅ |
| Vidi slobodnost predavača (npr. nedelja dana) | — | — | ✅ |
| Šalje zahtev za termin predavaču | — | — | ✅ |
| Uvid u svoje termine (šta je radjeno, kada) | — | — | ✅ |

---

*Dokument služi kao referenca za razvoj i proveru pravila (RLS, UI, server akcije).*
