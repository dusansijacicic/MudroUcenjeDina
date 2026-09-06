import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { getDashboardInstructor } from '@/lib/dashboard';

export type ActorRole = 'admin' | 'instruktor' | 'sistem';

export type Actor = {
  /** auth.users.id realnog ulogovanog korisnika (ostaje isti i kad admin gleda "kao predavač"). */
  id: string | null;
  email: string | null;
  /** Čitljivo ime za prikaz u dnevniku (npr. ime i prezime instruktora). */
  name: string | null;
  role: ActorRole;
};

/**
 * Upisuje jedan red u dnevnik aktivnosti (activity_log). Nikad ne baca grešku – logovanje ne sme
 * da obori pravu akciju ako upis u dnevnik iz nekog razloga ne uspe (npr. tabela još ne postoji
 * jer migracija nije pokrenuta).
 */
export async function logActivity(
  actor: Actor,
  action: string,
  description: string,
  opts?: { entityType?: string; entityId?: string | null; metadata?: Record<string, unknown> }
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('activity_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_name: actor.name,
      actor_role: actor.role,
      action,
      entity_type: opts?.entityType ?? null,
      entity_id: opts?.entityId ?? null,
      description,
      metadata: opts?.metadata ?? null,
    });
    if (error) console.error('[audit] insert failed', error.message);
  } catch (err) {
    console.error('[audit] logActivity threw', err);
  }
}

/** Actor iz trenutno ulogovanog admina (koristi se u admin/actions.ts uz requireAdmin()). */
export async function getAdminActor(): Promise<Actor | null> {
  const { user } = await getAuthedUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null, name: null, role: 'admin' };
}

/**
 * Actor za predavačke (dashboard) akcije – ime/prezime instruktora za prikaz, ali actor_id je
 * UVEK realni ulogovani korisnik (i kad admin gleda dashboard "kao predavač" preko view_as_instructor
 * kolačića), da se ne izgubi trag ko je stvarno kliknuo.
 */
export async function getInstructorActor(): Promise<Actor | null> {
  const { user } = await getAuthedUser();
  if (!user) return null;
  const { instructor, isAdminView } = await getDashboardInstructor();
  const name = instructor ? `${instructor.ime ?? ''} ${instructor.prezime ?? ''}`.trim() || null : null;
  return {
    id: user.id,
    email: user.email ?? null,
    name,
    role: isAdminView ? 'admin' : 'instruktor',
  };
}

export type ActivityLogRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: ActorRole;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
};

export type ActivityLogFilters = {
  q?: string;
  role?: ActorRole;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  limit?: number;
};

/** Čita dnevnik aktivnosti (najnovije prvo) – samo za admina. Vraća prazan niz ako tabela još ne
 * postoji (migracija 041 nije pokrenuta) umesto da obori stranicu. */
export async function getActivityLog(filters: ActivityLogFilters = {}): Promise<ActivityLogRow[]> {
  const isAdmin = await getIsAdmin();
  if (!isAdmin) return [];

  const admin = createAdminClient();
  let query = admin
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 300);

  if (filters.role) query = query.eq('actor_role', filters.role);
  if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00`);
  if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`);
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    query = query.or(
      `description.ilike.%${q}%,actor_name.ilike.%${q}%,actor_email.ilike.%${q}%,action.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error('[audit] getActivityLog failed', error.message);
    return [];
  }
  return (data ?? []) as ActivityLogRow[];
}
