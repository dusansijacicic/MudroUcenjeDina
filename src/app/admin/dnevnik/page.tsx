import { getAuthedUser, getIsAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getActivityLog, type ActorRole } from '@/lib/audit';

const ROLE_LABEL: Record<ActorRole, string> = {
  admin: 'Admin',
  instruktor: 'Predavač',
  sistem: 'Sistem',
};
const ROLE_COLOR: Record<ActorRole, string> = {
  admin: 'bg-blue-100 text-blue-700',
  instruktor: 'bg-emerald-100 text-emerald-700',
  sistem: 'bg-stone-200 text-stone-600',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Link ka entitetu na koji se log odnosi – samo za tipove gde je entity_id pouzdano ID stranice
 * koja postoji (termin/klijent); za ostale (instruktor/učionica/zahtev/uplata...) nema linka. */
function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityId) return null;
  if (entityType === 'term' || entityType === 'predavanje') return `/admin/termin/${entityId}`;
  if (entityType === 'client') return `/admin/klijenti/${entityId}`;
  return null;
}

export default async function AdminDnevnikPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; from?: string; to?: string }>;
}) {
  const { user } = await getAuthedUser();
  if (!user) redirect('/login');
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect('/login');

  const params = await searchParams;
  const role: ActorRole | undefined =
    params.role === 'admin' || params.role === 'instruktor' || params.role === 'sistem' ? (params.role as ActorRole) : undefined;
  const logs = await getActivityLog({ q: params.q, role, from: params.from, to: params.to });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-stone-800">Dnevnik aktivnosti</h1>
        <p className="text-stone-500 text-sm mt-0.5">
          Ko je šta uradio – zakazivanje/izmena/brisanje termina, klijenti, uplate i još mnogo toga. Poslednjih {logs.length} zapisa
          {(params.q || role || params.from || params.to) ? ' koji odgovaraju filteru.' : '.'}
        </p>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-3">
        <div className="min-w-[220px]">
          <label className="block text-xs font-medium text-stone-700 mb-1">Pretraga</label>
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="opis, ime, email, akcija…"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-700 mb-1">Ko</label>
          <select name="role" defaultValue={params.role ?? ''} className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 bg-white">
            <option value="">svi</option>
            <option value="admin">Admin</option>
            <option value="instruktor">Predavač</option>
            <option value="sistem">Sistem</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-700 mb-1">Od</label>
          <input type="date" name="from" defaultValue={params.from ?? ''} className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800" />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-700 mb-1">Do</label>
          <input type="date" name="to" defaultValue={params.to ?? ''} className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800" />
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700">
          Filtriraj
        </button>
        {(params.q || params.role || params.from || params.to) && (
          <Link href="/admin/dnevnik" className="text-sm text-stone-500 hover:text-stone-700 underline">
            Resetuj
          </Link>
        )}
      </form>

      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-stone-500">Nema zapisa za ovaj filter.</div>
        ) : (
          logs.map((log) => {
            const href = entityHref(log.entity_type, log.entity_id);
            return (
              <div key={log.id} className="p-3 flex items-start gap-3 text-sm">
                <span className="shrink-0 w-[140px] text-stone-400 text-xs pt-0.5 tabular-nums">{formatDateTime(log.created_at)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[log.actor_role] ?? ROLE_COLOR.sistem}`}>
                  {ROLE_LABEL[log.actor_role] ?? log.actor_role}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-stone-800">
                    <span className="font-medium">{log.actor_name || log.actor_email || 'nepoznat korisnik'}</span>
                    {' — '}
                    {log.description}
                    {href && (
                      <Link href={href} className="ml-1.5 text-amber-700 hover:underline">
                        →
                      </Link>
                    )}
                  </p>
                  <span className="text-[11px] text-stone-400 font-mono">{log.action}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
