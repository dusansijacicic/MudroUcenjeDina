import { cache } from 'react';
import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { getDashboardInstructor } from '@/lib/dashboard';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Actor } from '@/lib/audit';

/** Pregled i zakazivanje za sve instruktore; ostale admin akcije imaju zasebnu proveru. */
export const requireSchedulingAccess = cache(async function requireSchedulingAccess() {
  const { user } = await getAuthedUser();
  if (!user) return { error: 'Niste ulogovani.', admin: null, actor: null };

  const isAdmin = await getIsAdmin();
  const { instructor } = isAdmin ? { instructor: null } : await getDashboardInstructor();
  if (!isAdmin && !instructor) {
    return { error: 'Samo admin ili instruktor može da zakazuje termine.', admin: null, actor: null };
  }

  const actor: Actor = {
    id: user.id,
    email: user.email ?? null,
    name: instructor ? `${instructor.ime} ${instructor.prezime}`.trim() : null,
    role: isAdmin ? 'admin' : 'instruktor',
  };
  return { error: null, admin: createAdminClient(), actor };
});
