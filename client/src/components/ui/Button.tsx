import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  asChild?: false
}

const sizes = {
  sm: 'px-5 py-2 text-xs',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-sm',
} as const

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.14em] uppercase',
          'transition-all duration-300 ease-out select-none cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-bright focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          sizes[size],
          {
            primary: [
              'bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left text-ink',
              'shadow-glow-purple',
              'hover:bg-right hover:shadow-glow-magenta hover:-translate-y-0.5',
              'active:translate-y-0 active:scale-[0.98]',
            ].join(' '),
            secondary: [
              'border border-surface-300/80 text-text-primary backdrop-blur-sm',
              'hover:border-purple/45 hover:bg-surface-100/60 hover:shadow-glow-purple hover:-translate-y-0.5',
              'active:translate-y-0 active:scale-[0.98]',
            ].join(' '),
            ghost: [
              'border border-transparent text-text-muted',
              'hover:text-text-primary hover:border-surface-300/60 hover:bg-surface-100/50',
            ].join(' '),
          }[variant],
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button