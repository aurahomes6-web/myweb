import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/cn'

interface GlowBackgroundProps {
  children?: ReactNode
  className?: string
}

/**
 * Ambient RGB light source used behind hero / CTA content.
 * Two slow-moving gradients (transform-only animation, GPU friendly).
 */
export default function GlowBackground({ children, className }: GlowBackgroundProps) {
  const reduced = useReducedMotion()

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      <motion.div
        className="absolute -top-[20%] -left-[15%] h-[55vmax] w-[55vmax] rounded-full opacity-[0.10] blur-[90px]"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, var(--color-purple), transparent 65%)',
          willChange: 'transform',
        }}
        animate={reduced ? undefined : { x: [0, 40, -20, 0], y: [0, -24, 18, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute -bottom-[25%] -right-[10%] h-[45vmax] w-[45vmax] rounded-full opacity-[0.09] blur-[90px]"
        style={{
          background:
            'radial-gradient(circle at 70% 70%, var(--color-cyan), transparent 65%)',
          willChange: 'transform',
        }}
        animate={reduced ? undefined : { x: [0, -36, 24, 0], y: [0, 26, -20, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute top-[30%] right-[30%] h-[28vmax] w-[28vmax] rounded-full opacity-[0.06] blur-[80px]"
        style={{
          background:
            'radial-gradient(circle, var(--color-magenta), transparent 65%)',
          willChange: 'transform',
        }}
        animate={reduced ? undefined : { x: [0, -28, 18, 0], y: [0, 20, -26, 0] }}
        transition={{ duration: 36, repeat: Infinity, ease: 'linear' }}
      />
      {children}
    </div>
  )
}