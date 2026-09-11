import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/cn'
import type { AccentKind } from '@/types'

const eyebrowTones: Record<AccentKind, string> = {
  purple: 'text-purple-bright',
  cyan: 'text-cyan-bright',
  magenta: 'text-magenta-bright',
}

interface SectionHeadingProps {
  eyebrow: string
  title: ReactNode
  description?: string
  align?: 'center' | 'left'
  tone?: AccentKind
  className?: string
}

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'center',
  tone = 'purple',
  className,
}: SectionHeadingProps) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      initial={reduced ? {} : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      viewport={{ once: true, margin: '-60px' }}
      className={cn(
        'mb-16',
        align === 'center' ? 'text-center' : 'text-left',
        className
      )}
    >
      <p
        className={cn(
          'mb-5 flex items-center gap-3 text-xs font-medium tracking-[0.32em] uppercase',
          eyebrowTones[tone],
          align === 'center' && 'justify-center'
        )}
      >
        <span className="h-px w-8 bg-current opacity-50" />
        {eyebrow}
        <span className="h-px w-8 bg-current opacity-50" />
      </p>
      <h2 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            'mt-5 max-w-xl text-lg leading-relaxed text-text-secondary',
            align === 'center' && 'mx-auto'
          )}
        >
          {description}
        </p>
      )}
    </motion.div>
  )
}