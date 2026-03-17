import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Instructor } from '@/types/database';

/**
 * Vraća "trenutnog" predavača za dashboard:
 * - Ako je ulogovan admin i postoji view_as_instructor cookie → predavač koga admin gleda
 * - Inače → predavač po user_id (samo svoje)
 * Ako nema predavača (npr. admin bez view_as), vraća null.
 */
export async function getDashboardInstructor(): Promise<{
  instructor: Instructor | null;
  isAdminView: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { instructor: null, isAdminView: false };
  }

  const cookieStore = await cookies();
  const viewAsId = cookieStore.get('view_as_instructor')?.value;

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (admin && viewAsId) {
    const { data } = await supabase
      .from('instructors')
      .select('*')
      .eq('id', viewAsId)
      .single();
    if (data) {
      return { instructor: data as Instructor, isAdminView: true };
    }
  }

  const { data } = await supabase
    .from('instructors')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return { instructor: (data as Instructor) ?? null, isAdminView: false };
}
