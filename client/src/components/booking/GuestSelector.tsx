import { Minus, Plus, Users } from 'lucide-react'
import { cn } from '@/lib/cn'

interface GuestSelectorProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

export default function GuestSelector({ value, min, max, onChange }: GuestSelectorProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Users size={16} className="text-cyan-bright" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
            Guests
          </p>
          <p className="text-sm font-semibold text-text-primary">
            {value} {value === 1 ? 'guest' : 'guests'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-surface-300/70 bg-surface-100/60 p-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label="Remove a guest"
          className={cn(
            'grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors',
            'hover:bg-surface-200 hover:text-text-primary',
            'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'
          )}
        >
          <Minus size={15} />
        </button>
        <span aria-live="polite" className="min-w-8 text-center text-sm font-semibold tabular-nums text-text-primary">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label="Add a guest"
          className={cn(
            'grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors',
            'hover:bg-surface-200 hover:text-text-primary',
            'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'
          )}
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  )
}