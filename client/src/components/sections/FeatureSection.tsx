import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, CalendarCheck, Gem } from 'lucide-react'
import type { AccentKind } from '@/types'
import SectionHeading from '@/components/ui/SectionHeading'
import { accentPalettes } from '@/config/accents'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const features: {
  icon: typeof Gem
  title: string
  description: string
  accent: AccentKind
}[] = [
  {
    icon: ShieldCheck,
    title: 'Private & Comfortable',
    description:
      'Thoughtfully designed spaces for a relaxed stay. Your own entrance, your own space — nothing shared.',
    accent: 'purple',
  },
  {
    icon: CalendarCheck,
    title: 'Effortless Booking',
    description:
      'Check availability and reserve your stay easily. No friction, no fuss — just a seamless experience.',
    accent: 'cyan',
  },
  {
    icon: Gem,
    title: 'Designed to Feel Different',
    description:
      'A stay with personality, atmosphere and character. Spaces crafted to feel like a sanctuary above the city.',
    accent: 'magenta',
  },
]

export default function FeatureSection() {
  const reduced = useReducedMotion()

  return (
    <section id="about" className="relative overflow-hidden bg-surface-50/50 py-24 lg:py-32">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <SectionHeading
              align="left"
              tone="cyan"
              eyebrow="Why Aura Homes"
              title={
                <>
                  THE AURA
                  <br />
                  DIFFERENCE
                </>
              }
              description="Not just a stay — an experience designed around you. Three principles guide everything we build."
            />
          </div>

          <div className="flex flex-col">
            {features.map((feature, index) => {
              const Icon = feature.icon
              const palette = accentPalettes[feature.accent]
              return (
                <motion.div
                  key={feature.title}
                  initial={reduced ? undefined : { opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  viewport={{ once: true, margin: '-50px' }}
                  className="group relative flex gap-5 border-t border-surface-300/40 py-8 first:border-t-0 sm:first:border-t sm:first:border-surface-300/40 sm:gap-7"
                >
                  <div
                    className="pointer-events-none absolute -inset-x-4 -inset-y-2 -z-10 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(circle at 20% 50%, ${palette.main}14, transparent 60%)`,
                    }}
                  />

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-surface-300/60 bg-surface-100/60 transition-colors duration-500">
                    <Icon
                      size={20}
                      strokeWidth={1.75}
                      style={{ color: palette.main }}
                    />
                  </div>

                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="font-display text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
                        {feature.title}
                      </h3>
                      <span className="font-display text-sm font-medium tabular-nums tracking-widest text-text-muted">
                        0{index + 1}
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              )
            })}

            <motion.div
              initial={reduced ? undefined : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="mt-10"
            >
              <Link
                to="/properties"
                className="group inline-flex w-fit items-center gap-3 text-sm font-semibold uppercase tracking-[0.16em] text-text-primary"
              >
                <span className="link-underline">Discover the homes</span>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-300/70 text-center transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-cyan/50 group-hover:shadow-glow-cyan"
                  aria-hidden="true"
                >
                  <span className="text-cyan-bright">&#8599;</span>
                </span>
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}