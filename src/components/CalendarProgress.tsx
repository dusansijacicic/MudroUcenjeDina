export default function CalendarProgress({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/60 cursor-progress" role="status" aria-live="polite">
      <span className="rounded-xl border border-amber-200 bg-white px-5 py-3 font-medium text-amber-900 shadow-lg">
        Učitavam kalendar…
      </span>
    </div>
  );
}
