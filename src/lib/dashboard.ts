import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import type { Instructor } from '@/types/database';

/** Vrati predavača iz baze (običan klijent ili, ako padne, service role – samo za user_id). */
async function fetchInstructorByUserId(supabase: Awaited<ReturnType<typeof createClient>>, adminSupabase: ReturnType<typeof createAdminClient> | null, userId: string): Promise<Instructor | null> {
  const { data, error } = await supabase
    .from('instructors')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return data as Instructor;
  if (error && adminSupabase) {
    const { data: adminData } = await adminSupabase
      .from('instructors')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (adminData) return adminData as Instructor;
  }
  return null;
}

/**
 * Vraća "trenutnog" predavača za dashboard:
 * - Ako je ulogovan admin i postoji view_as_instructor cookie → predavač koga admin gleda
 * - Inače → predavač po user_id (samo svoje)
 * Ako RLS padne (500), koristi service role da nađe predavača po user_id.
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

  let adminSupabase: ReturnType<typeof createAdminClient> | null = null;
  try {
    adminSupabase = createAdminClient();
  } catch {
    // nema service role key
  }
  const instructor = await fetchInstructorByUserId(supabase, adminSupabase, user.id);
  return { instructor, isAdminView: false };
}
