import type { BookingStatusValue } from '@/types'
import type { AirbnbStatusValue } from '@/types/admin'
import { cn } from '@/lib/cn'

const styles: Record<BookingStatusValue | AirbnbStatusValue, string> = {
  PENDING: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  CONFIRMED: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  CANCELLED: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
  ACTIVE: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
}

export function StatusPill({ status }: { status: BookingStatusValue | AirbnbStatusValue }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]',
        styles[status]
      )}
    >
      {status}
    </span>
  )
}