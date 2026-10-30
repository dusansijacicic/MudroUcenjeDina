/**
 * Koji je ovo čas po redu od plaćenih i koliko plaćenih ostaje posle njega.
 * redni = [x, y] iz rpc redni_broj_casova (x = redni broj časa te vrste, y = plaćeno časova te vrste).
 */
export default function PlacenoStanje({ redni }: { redni: [number, number] }) {
  const [x, y] = redni;
  if (x > y) {
    return (
      <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
        ! Nije plaćeno – {x}. čas, plaćeno {y}
      </span>
    );
  }
  if (x === y) {
    return (
      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        {x}. čas od {y} plaćenih · poslednji plaćeni
      </span>
    );
  }
  return (
    <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 tabular-nums">
      {x}. čas od {y} plaćenih · preostalo još {y - x}
    </span>
  );
}
