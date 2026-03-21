import 'server-only';

import type { User, SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

const NO_MATCH = '/login?reason=no_instructor';

/**
 * Gde uputiti korisnika posle uspešne sesije: /admin, /dashboard (predavač), /ucenik.
 * Učenik: red clients.user_id, zatim RPC link_client_to_user (login_email = email naloga),
 * zatim opciono service-role fallback ako RPC nije mogao (retko).
 */
export async function resolvePostAuthPath(
  user: User,
  supabaseWithSession: SupabaseClient
): Promise<string> {
  const uid = user.id;

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  if (admin) {
    const [admRes, instRes, clRes] = await Promise.all([
      admin.from('admin_users').select('user_id').eq('user_id', uid).maybeSingle(),
      admin.from('instructors').select('id').eq('user_id', uid).maybeSingle(),
      admin.from('clients').select('id').eq('user_id', uid).maybeSingle(),
    ]);
    if (admRes.data) return '/admin';
    if (instRes.data) return '/dashboard';
    if (clRes.data) return '/ucenik';
  } else {
    const { data: adm } = await supabaseWithSession
      .from('admin_users')
      .select('user_id')
      .eq('user_id', uid)
      .maybeSingle();
    if (adm) return '/admin';
    const { data: inst } = await supabaseWithSession
      .from('instructors')
      .select('id')
      .eq('user_id', uid)
      .maybeSingle();
    if (inst) return '/dashboard';
    const { data: cl } = await supabaseWithSession
      .from('clients')
      .select('id')
      .eq('user_id', uid)
      .maybeSingle();
    if (cl) return '/ucenik';
  }

  // Veza učenika: predavač je uneo login_email; prva prijava preko /login nije ranije pozivala RPC
  const { error: rpcErr } = await supabaseWithSession.rpc('link_client_to_user');
  if (rpcErr) {
    console.warn('[resolvePostAuthPath] link_client_to_user', rpcErr.message);
  }

  if (admin) {
    const { data: afterLink } = await admin.from('clients').select('id, user_id').eq('user_id', uid).maybeSingle();
    if (afterLink) return '/ucenik';

    const raw = user.email?.trim();
    if (raw) {
      const { data: byEmail } = await admin
        .from('clients')
        .select('id, user_id')
        .ilike('login_email', raw)
        .maybeSingle();
      if (byEmail) {
        if (byEmail.user_id && byEmail.user_id !== uid) {
          return '/login?reason=client_email_taken';
        }
        if (!byEmail.user_id) {
          await admin.from('clients').update({ user_id: uid }).eq('id', byEmail.id);
        }
        return '/ucenik';
      }
    }
  } else {
    const { data: cl2 } = await supabaseWithSession.from('clients').select('id').eq('user_id', uid).maybeSingle();
    if (cl2) return '/ucenik';
  }

  return NO_MATCH;
}
