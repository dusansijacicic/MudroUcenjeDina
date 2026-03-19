# Dina Kalendar

A full-stack **scheduling and teaching management** web app for a school or tutoring center. It lets **admins** manage instructors and see all data, **instructors** (predavači) manage their calendar, clients, lessons, and payments, and **students** (učenici) view their lessons and request new ones.

---

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org) (App Router, React 19)
- **Database & Auth:** [Supabase](https://supabase.com) (PostgreSQL, Row Level Security, Auth)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com)
- **Language:** TypeScript

---

## User Roles

| Role | Description | Entry point |
|------|-------------|-------------|
| **Admin** | Full access: manage instructors, view all clients and data, school-wide settings | `/admin` |
| **Instructor** (predavač) | Own calendar, clients, lessons, payments, and availability | `/dashboard` |
| **Student** (učenik) | View own lessons, payments, and request new lessons | `/ucenik` |

After login, the app redirects to the correct area based on the user type. Admins can also “view as” a specific instructor (dashboard with that instructor’s context).

---

## Features

### Admin

- **Instructors (predavači):** List all instructors, add new one (registration link or “Novi predavač”), open “view” for any instructor (calendar + clients as that instructor).
- **Clients (klijenti):** Unified list of all clients with linked instructors, paid/held lessons per type, warnings when more lessons were held than paid.
- **Calendar:** Same calendar as instructor view but for the selected instructor (from “view”).
- **Term types (vrste termina):** CRUD for lesson types (e.g. “Individualni čas”, “Grupni”) used in payments and lessons.
- **Classrooms (učionice):** CRUD for rooms; assign to terms for schedule display.
- **Settings (podešavanja):** App-wide settings (e.g. max lessons per slot).
- **Payments (uplate):** School-wide payment list and creating payments (client, instructor, term type, amount, number of lessons).

### Instructor (Dashboard)

- **Calendar:** Week / day / month view; create terms (date + slot + optional classroom); see own and other instructors’ terms (who is in which slot); filter by client.
- **Clients (klijenti):** List of linked clients with balance by lesson type (paid vs held vs remaining); add new client; open client detail (payments, lessons, edit).
- **Lessons (predavanja):** From calendar: add/edit/delete lessons in a term; mark as held (održano) and/or paid (plaćeno); comment; link to term type.
- **Payments (uplate):** List of payments for the instructor; create payment (client, term type, amount, number of lessons).
- **Requests (zahtevi):** Requests from students for a lesson (date, slot); confirm (creates term + lesson), change date/slot, or reject; optional note to student.
- **Settings (podešavanja):** Profile and **availability** (weekly pattern + periods); used so students see only available slots when requesting a lesson.

### Student (Učenik)

- **Overview:** Past and upcoming lessons with date, time, instructor, lesson type; list of payments (uplate) and balance by type.
- **Calendar:** Own lessons in a calendar view.
- **Request lesson (zahtev):** Choose date and slot; see which slots are occupied and which are free; optionally choose instructor; submit request. After the instructor confirms or changes, the student sees the result and any note.

---

## Data Model (Summary)

- **instructors** – linked to Auth `user_id`; name, email, color (for calendar).
- **clients** – students; optional `user_id` / `login_email` for student login; linked to instructors via **instructor_clients** (many-to-many; `placeno_casova` per link).
- **terms** – one slot: `instructor_id`, `date`, `slot_index`, optional `classroom_id`. Time comes from slot index + app config (e.g. slots from 9:00).
- **predavanja** – one lesson inside a term: `term_id`, `client_id`, `odrzano`, `placeno`, `term_type_id`, `komentar`.
- **term_types** – kinds of lessons (used in payments and predavanja).
- **uplate** – payments: `client_id`, `instructor_id`, `term_type_id`, `broj_casova`, `iznos`, etc.
- **zahtevi_za_cas** – student request: `client_id`, optional `instructor_id`, `requested_date`, `requested_slot_index`, `status` (pending/confirmed/changed/rejected), resolution and optional `created_term_id` / `created_predavanje_id`.
- **classrooms** – rooms for terms.
- **admin_users** – list of Auth user IDs that are admins.
- **instructor_weekly_availability** / **instructor_availability_periods** – when an instructor is available; RPC `get_instructor_available_slots` for student request flow.
- **app_settings** – global config (e.g. max lessons per slot).

Access control is done with Supabase **Row Level Security (RLS)** so that instructors see only their data, students only their own, and admins use the service role when needed.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm (or yarn/pnpm)
- Supabase project (free tier is enough)

### 1. Clone and install

```bash
git clone <repo-url>
cd "Dina kalendar"
npm install
```

### 2. Environment variables

Copy the example env file and fill in your Supabase keys:

```bash
cp .env.local.example .env.local
```

In `.env.local` set:

- `NEXT_PUBLIC_SUPABASE_URL` – Supabase project URL (Project Settings → API)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` – Supabase service_role key (needed for admin “Novi predavač” and for dashboard to load all instructors’ terms; keep secret)

### 3. Database setup

The app does **not** run migrations automatically. You must run the SQL migrations in the Supabase SQL Editor, **in order**. See **[KAKO_POKRENUTI_SQL.md](./KAKO_POKRENUTI_SQL.md)** for step-by-step instructions and the list of migration files in `supabase/migrations/` (from `001_initial.sql` onward). After that, you can optionally seed mock data with `supabase/seed_mock_data.sql` if you have it.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use “Registrujte se” to create the first instructor account. To get admin access, add your user’s ID to the `admin_users` table in Supabase (see migration `004_admin_users.sql`).

---

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run production server (after `build`) |
| `npm run lint` | Run ESLint |

---

## Deployment

For **free hosting** (Vercel + Supabase), follow **[HOSTING.md](./HOSTING.md)**. It covers:

- Creating a Supabase project and running migrations
- Setting env vars locally and on Vercel
- Configuring Supabase Auth redirect URLs for your Vercel domain
- One-time redirect setup after deploy

---

## Project Structure (main parts)

```
src/
├── app/
│   ├── page.tsx              # Home: redirects by role (admin / dashboard / ucenik)
│   ├── login/                # Login & registration (instructor, student)
│   ├── admin/                # Admin UI: instructors, clients, calendar, term types, classrooms, settings, uplate
│   ├── dashboard/            # Instructor UI: calendar, klijenti, uplate, zahtevi, podesavanja
│   ├── ucenik/               # Student UI: overview, calendar, zahtev
│   └── api/                  # API routes (e.g. auth callback)
├── lib/
│   ├── supabase/             # createClient (browser/server), createAdminClient (service role)
│   ├── dashboard.ts          # getDashboardInstructor (cached), used by dashboard layout/pages
│   └── constants.ts           # TIME_SLOTS, defaults
├── types/
│   └── database.ts            # Instructor, Client, Term, Predavanje, ZahtevZaCas, etc.
└── components/               # Shared UI (toast, buttons, etc.)

supabase/
├── migrations/               # SQL migrations (run manually in Supabase SQL Editor)
├── seed_mock_data.sql        # Optional mock data
└── FULL_RESET_AND_MIGRATE.sql  # Optional full reset script
```

---

## Performance

- **Batch loading:** Client list pages (admin and dashboard) load “stanje po vrstama” for all clients in one batch (`getStanjePoVrstamaZaKlijenteBatch`) instead of one call per client.
- **Request deduplication:** `getDashboardInstructor()` is wrapped in React `cache()` so layout and page share one call per request.
- **Bundles:** Next.js `optimizePackageImports` is used for `@supabase/supabase-js` and `react-hot-toast` to keep client bundles smaller.

---

## License

Private. All rights reserved.
