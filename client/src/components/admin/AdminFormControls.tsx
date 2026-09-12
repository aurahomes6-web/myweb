import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-text-muted">{hint}</span>}
      {error && <span className="text-xs text-magenta-bright">{error}</span>}
    </label>
  )
}

const controlBase =
  'w-full rounded-xl border border-surface-300/70 bg-surface-100/50 px-4 py-2.5 text-sm text-text-primary ' +
  'placeholder:text-text-muted/60 outline-none transition-colors focus:border-purple/50 focus:ring-2 focus:ring-purple/20'

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(controlBase, className)} {...props} />
)
TextInput.displayName = 'TextInput'

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlBase, 'min-h-28 resize-y leading-relaxed', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlBase, 'cursor-pointer', className)} {...props}>
      {children}
    </select>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-magenta/40 bg-magenta/10 px-4 py-3 text-sm text-magenta-bright">
      {message}
    </div>
  )
}

export function DetailList({ details }: { details?: Array<{ field: string; message: string }> }) {
  if (!details || details.length === 0) return null
  return (
    <ul className="mt-3 flex flex-col gap-1.5 text-xs text-magenta-bright">
      {details.map((detail, index) => (
        <li key={`${detail.field}-${index}`}>
          {detail.field ? <span className="font-semibold">{detail.field}: </span> : null}
          {detail.message}
        </li>
      ))}
    </ul>
  )
}