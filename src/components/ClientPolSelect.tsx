'use client';

import { CLIENT_POL_OPTIONS } from '@/lib/client-pol';

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** kid theme za /ucenik */
  variant?: 'default' | 'kid';
};

/**
 * Pol učenika (muski / zenski). Ista komponenta na registraciji, predavačkoj formi, adminu i profilu učenika.
 */
export default function ClientPolSelect({
  id = 'client-pol',
  value,
  onChange,
  required = false,
  variant = 'default',
}: Props) {
  const labelKid = 'block text-sm font-medium text-[var(--kid-text)] mb-1';
  const labelDefault = 'block text-sm font-medium text-stone-700 mb-1';
  const selectKid =
    'w-full rounded-xl border-2 border-[var(--kid-sky-dark)]/40 px-3 py-2.5 text-[var(--kid-text)] bg-white focus:ring-2 focus:ring-[var(--kid-teal)]';
  const selectDefault =
    'w-full rounded-lg border-2 border-stone-300 px-3 py-2 text-stone-800 bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

  return (
    <div
      className={
        variant === 'kid'
          ? 'rounded-xl border-2 border-[var(--kid-teal)]/25 bg-[var(--kid-teal)]/5 p-3'
          : 'rounded-lg border-2 border-amber-200 bg-amber-50/60 p-3 shadow-sm'
      }
    >
      <label htmlFor={id} className={variant === 'kid' ? labelKid : labelDefault}>
        Pol{' '}
        {required ? (
          <span className="text-red-600">*</span>
        ) : (
          <span className={variant === 'kid' ? 'text-[var(--kid-text-muted)] font-normal' : 'text-stone-500 font-normal'}>
            (opciono)
          </span>
        )}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={variant === 'kid' ? selectKid : selectDefault}
        aria-label="Pol učenika"
      >
        <option value="">{required ? 'Izaberite pol' : '— nije uneto —'}</option>
        {CLIENT_POL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
